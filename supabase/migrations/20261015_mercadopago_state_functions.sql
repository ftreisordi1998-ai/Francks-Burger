-- Mercado Pago — funções de estado.
--
-- Todas são SECURITY DEFINER e chamadas só pelo servidor (service role) ou,
-- no caso das consultas por token, pelo próprio cliente dono do pedido.
-- Nenhuma delas confia em valores vindos do navegador: valor, moeda, status e
-- data de aprovação sempre vêm da resposta da API do provedor, reconsultada.

-- ---------------------------------------------------------------------------
-- Ordem dos estados: uma notificação antiga nunca pode "voltar" um pagamento
-- aprovado para pendente. Estornos e contestações vêm DEPOIS de aprovado.
-- ---------------------------------------------------------------------------
create or replace function mp_status_rank(p_status text)
returns integer
language sql
immutable
as $$
  select case p_status
    when 'creating'     then 0
    when 'pending'      then 1
    when 'in_process'   then 2
    when 'authorized'   then 2
    when 'in_mediation' then 2
    when 'approved'     then 3
    when 'rejected'     then 3
    when 'cancelled'    then 3
    when 'refunded'     then 4
    when 'charged_back' then 4
    else 1
  end;
$$;

-- ---------------------------------------------------------------------------
-- Aplica, numa única transação, o estado verificado de uma cobrança ao
-- pedido. É idempotente: chamar duas vezes com o mesmo estado não muda nada.
-- ---------------------------------------------------------------------------
create or replace function apply_provider_payment_state(
  p_attempt_id uuid,
  p_provider_payment_id text,
  p_status text,
  p_status_detail text,
  p_amount_cents integer,
  p_currency text,
  p_live_mode boolean,
  p_expected_live_mode boolean,
  p_date_approved timestamptz,
  p_date_of_expiration timestamptz,
  p_fee_cents integer,
  p_net_cents integer,
  p_payload jsonb
)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_attempt payment_attempts%rowtype;
  v_order   orders%rowtype;
  v_edition editions%rowtype;
  v_prev_status text;
  v_regressed boolean := false;
  v_problem text := null;
  v_confirmed boolean := false;
  v_refund_kind text;
begin
  select * into v_attempt from payment_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  select * into v_order from orders where id = v_attempt.order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  select * into v_edition from editions where id = v_order.edition_id;

  v_prev_status := v_attempt.status;

  -- Evento fora de ordem: registra o payload mas não regride o estado.
  if mp_status_rank(p_status) < mp_status_rank(v_prev_status) then
    v_regressed := true;
  end if;

  update payment_attempts set
    provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
    status              = case when v_regressed then status else p_status end,
    status_detail       = case when v_regressed then status_detail else p_status_detail end,
    live_mode           = coalesce(p_live_mode, live_mode),
    date_approved       = coalesce(date_approved, p_date_approved),
    date_of_expiration  = coalesce(p_date_of_expiration, date_of_expiration),
    fee_cents           = coalesce(p_fee_cents, fee_cents),
    net_received_cents  = coalesce(p_net_cents, net_received_cents),
    fees_pending        = (coalesce(p_net_cents, net_received_cents) is null),
    last_provider_payload = p_payload,
    last_synced_at      = now(),
    updated_at          = now()
  where id = p_attempt_id
  returning * into v_attempt;

  if v_regressed then
    return json_build_object('applied', false, 'reason', 'OUT_OF_ORDER',
                             'attempt_status', v_attempt.status);
  end if;

  -- -----------------------------------------------------------------------
  -- Aprovado: aqui o dinheiro entrou. A pergunta é se a ENCOMENDA pode ser
  -- confirmada ou se precisa de alguém olhando.
  -- -----------------------------------------------------------------------
  if p_status = 'approved' then
    if p_currency is distinct from 'BRL' then
      v_problem := 'Moeda diferente de BRL (' || coalesce(p_currency, '?') || ').';
    elsif p_amount_cents is distinct from v_order.total_cents then
      v_problem := format('Valor divergente: cobrado %s, esperado %s (centavos).',
                          p_amount_cents, v_order.total_cents);
    elsif p_live_mode is distinct from p_expected_live_mode then
      v_problem := 'Ambiente divergente (pagamento de teste em produção ou vice-versa).';
    elsif v_order.payment_status = 'paid'
          and v_order.payment_provider = 'mercadopago'
          and exists (
            select 1 from payment_attempts a
            where a.order_id = v_order.id and a.id <> p_attempt_id and a.status = 'approved'
          ) then
      v_problem := 'Pagamento duplicado: o pedido já tinha outra cobrança aprovada.';
    elsif v_order.order_status = 'cancelled' then
      v_problem := 'Pedido já estava cancelado quando o pagamento foi aprovado (reserva liberada).';
    elsif p_date_approved is not null and p_date_approved > v_edition.order_deadline then
      v_problem := format('Aprovado em %s, depois do encerramento das encomendas (%s).',
                          to_char(p_date_approved at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                          to_char(v_edition.order_deadline at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
    end if;

    if v_problem is null then
      -- Caminho feliz. Só confirma a produção se ainda estava aguardando;
      -- se já estava confirmado (reprocessamento), não mexe.
      update orders set
        payment_status       = 'paid',
        payment_provider     = 'mercadopago',
        payment_method       = case when v_attempt.method = 'pix' then 'pix'::payment_method
                                    else 'card'::payment_method end,
        payment_confirmed_at = coalesce(payment_confirmed_at, p_date_approved, now()),
        payment_confirmed_by = coalesce(payment_confirmed_by, 'mercadopago'),
        order_status         = case when order_status = 'awaiting_confirmation'
                                    then 'confirmed'::order_status else order_status end,
        payment_resolution_required = false,
        payment_resolution_reason   = null
      where id = v_order.id;
      v_confirmed := true;
    else
      -- Dinheiro recebido, encomenda NÃO confirmada. Fica visível no admin.
      update orders set
        payment_status       = case when payment_status = 'pending' then 'paid'::payment_status
                                    else payment_status end,
        payment_provider     = 'mercadopago',
        payment_confirmed_at = coalesce(payment_confirmed_at, p_date_approved, now()),
        payment_confirmed_by = coalesce(payment_confirmed_by, 'mercadopago'),
        payment_resolution_required = true,
        payment_resolution_reason   = v_problem
      where id = v_order.id;
    end if;
  end if;

  -- -----------------------------------------------------------------------
  -- Estorno / contestação: nunca apaga histórico, nunca reabre estoque.
  -- -----------------------------------------------------------------------
  if p_status in ('refunded', 'charged_back') then
    v_refund_kind := case when p_status = 'charged_back' then 'chargeback' else 'refund' end;
    insert into payment_refunds (attempt_id, provider_refund_id, kind, amount_cents, status, raw)
    select p_attempt_id, null, v_refund_kind, coalesce(p_amount_cents, v_attempt.amount_cents), p_status, p_payload
    where not exists (
      select 1 from payment_refunds r
      where r.attempt_id = p_attempt_id and r.kind = v_refund_kind and r.provider_refund_id is null
    );

    update orders set
      payment_status = case
        when p_status = 'refunded' and p_status_detail is distinct from 'partially_refunded'
          then 'refunded'::payment_status
        else payment_status end,
      payment_resolution_required = true,
      payment_resolution_reason = case
        when p_status = 'charged_back' then 'Contestação (chargeback) aberta no provedor.'
        when p_status_detail = 'partially_refunded' then 'Estorno parcial registrado no provedor.'
        else 'Estorno total registrado no provedor.' end
    where id = v_order.id;
  end if;

  -- Aprovado com detalhe de estorno parcial (status continua "approved")
  if p_status = 'approved' and p_status_detail = 'partially_refunded' then
    update orders set
      payment_resolution_required = true,
      payment_resolution_reason = 'Estorno parcial registrado no provedor.'
    where id = v_order.id;
  end if;

  return json_build_object(
    'applied', true,
    'attempt_status', v_attempt.status,
    'order_confirmed', v_confirmed,
    'resolution_required', v_problem is not null,
    'resolution_reason', v_problem
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado de pagamento para o cliente (por token do pedido). Não expõe nada
-- além do próprio pedido; o token já é a credencial de acesso hoje.
-- ---------------------------------------------------------------------------
create or replace function get_order_payment_state(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_order orders%rowtype;
  v_edition editions%rowtype;
  v_attempt payment_attempts%rowtype;
begin
  select * into v_order from orders where public_token = p_token;
  if not found then
    return null;
  end if;
  select * into v_edition from editions where id = v_order.edition_id;

  -- Tentativa "relevante": aprovada > em andamento > a mais recente.
  select * into v_attempt from payment_attempts
  where order_id = v_order.id
  order by
    case status when 'approved' then 0
                when 'in_process' then 1 when 'authorized' then 1
                when 'pending' then 2 when 'creating' then 3
                else 4 end,
    created_at desc
  limit 1;

  return json_build_object(
    'order_id', v_order.id,
    'payment_status', v_order.payment_status,
    'order_status', v_order.order_status,
    'payment_provider', v_order.payment_provider,
    'payment_resolution_required', v_order.payment_resolution_required,
    'total_cents', v_order.total_cents,
    'expires_at', v_order.expires_at,
    'order_deadline', v_edition.order_deadline,
    'attempt', case when v_attempt.id is null then null else json_build_object(
      'id', v_attempt.id,
      'method', v_attempt.method,
      'status', v_attempt.status,
      'status_detail', v_attempt.status_detail,
      'amount_cents', v_attempt.amount_cents,
      'date_of_expiration', v_attempt.date_of_expiration,
      'qr_code', v_attempt.qr_code,
      'qr_code_base64', v_attempt.qr_code_base64,
      'ticket_url', v_attempt.ticket_url,
      'provider_payment_id', v_attempt.provider_payment_id
    ) end
  );
end;
$$;
grant execute on function get_order_payment_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Liberação de reserva de pedido online, só depois de conciliar. Chamada pela
-- rotina de conciliação APÓS sincronizar as tentativas com o provedor.
-- Recusa liberar se qualquer tentativa ainda puder virar dinheiro.
-- ---------------------------------------------------------------------------
create or replace function release_mp_order_if_unpaid(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_order orders%rowtype;
  v_open int;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.payment_provider is distinct from 'mercadopago'
     or v_order.payment_status <> 'pending'
     or v_order.order_status <> 'awaiting_confirmation'
     or v_order.expires_at is null
     or v_order.expires_at > now() then
    return json_build_object('released', false, 'reason', 'NOT_ELIGIBLE');
  end if;

  -- Qualquer tentativa que ainda possa ser aprovada bloqueia a liberação.
  select count(*) into v_open from payment_attempts a
  where a.order_id = p_order_id
    and (
      a.status in ('approved', 'in_process', 'authorized', 'in_mediation', 'creating')
      or (a.status = 'pending' and (a.date_of_expiration is null or a.date_of_expiration > now()))
    );
  if v_open > 0 then
    return json_build_object('released', false, 'reason', 'OPEN_ATTEMPT');
  end if;

  perform release_order_reservation(p_order_id);
  update orders set
    order_status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = 'Expirado: pagamento online não concluído a tempo'
  where id = p_order_id;

  return json_build_object('released', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidatos à conciliação: tentativas abertas (sem sync recente) e pedidos
-- online vencidos que ainda seguram reserva.
-- ---------------------------------------------------------------------------
create or replace function list_mp_reconciliation_candidates(p_stale_after_seconds integer default 90)
returns json
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  select json_build_object(
    'open_attempts', coalesce((
      select json_agg(json_build_object('attempt_id', a.id, 'provider_payment_id', a.provider_payment_id,
                                        'idempotency_key', a.idempotency_key, 'order_id', a.order_id))
      from payment_attempts a
      where a.status in ('creating', 'pending', 'in_process', 'authorized', 'in_mediation')
        and (a.last_synced_at is null or a.last_synced_at < now() - make_interval(secs => p_stale_after_seconds))
    ), '[]'::json),
    'expired_orders', coalesce((
      select json_agg(o.id)
      from orders o
      where o.payment_provider = 'mercadopago'
        and o.payment_status = 'pending'
        and o.order_status = 'awaiting_confirmation'
        and o.expires_at is not null and o.expires_at < now()
    ), '[]'::json)
  );
$$;
