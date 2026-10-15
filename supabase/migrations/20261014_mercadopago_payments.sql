-- Mercado Pago (Pix + cartão) — fundação de dados.
--
-- Princípios que guiaram o desenho:
--  * Nada aqui altera pedidos históricos: `payment_provider` nulo significa o fluxo
--    manual antigo (chave Pix estática + comprovante), que continua funcionando.
--  * O dinheiro é a fonte da verdade do provedor; nunca confiamos no navegador
--    nem no corpo do webhook — sempre reconsultamos a API e gravamos o que ela
--    responde em `payment_attempts`.
--  * Estado do pagamento e estado da produção são separados: um pagamento pode
--    estar aprovado e mesmo assim a encomenda não entrar na fila (fora do prazo,
--    reserva perdida), e nesse caso sinalizamos para resolução manual.

-- ---------------------------------------------------------------------------
-- 1. Colunas no pedido
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists payment_provider text
    check (payment_provider in ('manual', 'mercadopago')),
  add column if not exists payment_resolution_required boolean not null default false,
  add column if not exists payment_resolution_reason text;

comment on column orders.payment_provider is
  'null = fluxo manual histórico (chave Pix + comprovante). "mercadopago" = cobrança online.';
comment on column orders.payment_resolution_required is
  'Dinheiro recebido mas a encomenda não pôde ser confirmada (fora do prazo, valor divergente, reserva perdida). Exige ação humana.';

-- ---------------------------------------------------------------------------
-- 2. Tentativas de cobrança
-- ---------------------------------------------------------------------------

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'mercadopago',

  -- id da cobrança no provedor. Fica nulo entre o "vou criar" e a resposta da
  -- API: é isso que permite detectar uma criação que falhou por timeout e
  -- reaproveitar a mesma chave de idempotência em vez de cobrar duas vezes.
  provider_payment_id text,
  idempotency_key text not null,

  method text not null check (method in ('pix', 'credit_card')),
  status text not null default 'creating',
  status_detail text,

  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  live_mode boolean,

  date_approved timestamptz,
  date_of_expiration timestamptz,

  -- dados de exibição do Pix (não são segredo: o payload do BR Code é público)
  qr_code text,
  qr_code_base64 text,
  ticket_url text,

  fee_cents integer,
  net_received_cents integer,
  fees_pending boolean not null default true,

  last_provider_payload jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_attempts_idempotency_key_uq
  on payment_attempts (provider, idempotency_key);
create unique index if not exists payment_attempts_provider_payment_id_uq
  on payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists payment_attempts_order_idx on payment_attempts (order_id);
-- Usado pela conciliação: tentativas que ainda podem mudar de estado.
create index if not exists payment_attempts_open_idx on payment_attempts (status, last_synced_at)
  where status in ('creating', 'pending', 'in_process', 'authorized');

-- ---------------------------------------------------------------------------
-- 3. Webhooks recebidos (persistir ANTES de processar)
-- ---------------------------------------------------------------------------

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  provider_event_id text,
  provider_payment_id text,
  action text,
  request_id text,
  signature_ts text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  process_result text,
  error text
);

create index if not exists payment_webhook_events_payment_idx
  on payment_webhook_events (provider_payment_id, received_at desc);
create index if not exists payment_webhook_events_unprocessed_idx
  on payment_webhook_events (received_at) where processed_at is null;

-- ---------------------------------------------------------------------------
-- 4. Estornos e contestações
-- ---------------------------------------------------------------------------

create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references payment_attempts(id) on delete cascade,
  provider_refund_id text,
  kind text not null check (kind in ('refund', 'chargeback')),
  amount_cents integer not null,
  status text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_refunds_provider_uq
  on payment_refunds (kind, provider_refund_id)
  where provider_refund_id is not null;

-- ---------------------------------------------------------------------------
-- 5. RLS — tudo some do cliente; só admin lê. O webhook usa service role,
--    que ignora RLS por definição.
-- ---------------------------------------------------------------------------

alter table payment_attempts enable row level security;
alter table payment_webhook_events enable row level security;
alter table payment_refunds enable row level security;

drop policy if exists payment_attempts_admin_read on payment_attempts;
create policy payment_attempts_admin_read on payment_attempts
  for select using (is_admin());

drop policy if exists payment_webhook_events_admin_read on payment_webhook_events;
create policy payment_webhook_events_admin_read on payment_webhook_events
  for select using (is_admin());

drop policy if exists payment_refunds_admin_read on payment_refunds;
create policy payment_refunds_admin_read on payment_refunds
  for select using (is_admin());

-- ---------------------------------------------------------------------------
-- 6. Expiração de reservas: não liberar às cegas uma cobrança online
--
-- O job de minuto em minuto cancelava qualquer pedido Pix pendente vencido.
-- Com cobrança online isso é perigoso: o dinheiro pode ter entrado e a
-- notificação ainda não ter chegado. Pedidos do Mercado Pago passam a ser
-- liberados só pela conciliação, que consulta o provedor antes.
-- ---------------------------------------------------------------------------

-- Mantém a assinatura original (returns integer) de propósito: trocar o tipo de
-- retorno exigiria DROP FUNCTION, o que derrubaria o job do pg_cron que já roda
-- de minuto em minuto. A única mudança é a cláusula do payment_provider.
create or replace function release_expired_orders()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_order record;
  v_count int := 0;
begin
  for v_order in
    select id from orders
    where order_status = 'awaiting_confirmation'
      and payment_status = 'pending'
      and payment_method = 'pix'
      and coalesce(payment_provider, 'manual') = 'manual'
      and expires_at is not null
      and expires_at < now()
    for update skip locked
  loop
    perform release_order_reservation(v_order.id);
    update orders set order_status = 'cancelled', cancelled_at = now(), cancel_reason = 'Expirado: pagamento não confirmado a tempo'
      where id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
