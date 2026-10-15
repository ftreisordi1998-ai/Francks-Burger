-- Ação do admin sobre pagamentos que ficaram em "requer resolução".
--   confirm  -> a encomenda entra na produção (pedido ainda aguardando e
--               não cancelado). Usado quando o admin decide atender mesmo
--               com aprovação tardia / divergência aceitável.
--   dismiss  -> só limpa o alerta (ex.: estorno já feito manualmente no
--               painel do Mercado Pago). Não mexe em produção nem em estoque.
-- Nunca executa estorno: isso é feito no painel do provedor, por política.
create or replace function admin_resolve_payment_issue(p_order_id uuid, p_action text, p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_order orders%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_action not in ('confirm', 'dismiss') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if p_action = 'confirm' then
    if v_order.order_status = 'cancelled' then
      raise exception 'ORDER_CANCELLED';
    end if;
    if v_order.payment_status <> 'paid' then
      raise exception 'NOT_PAID';
    end if;
    update orders set
      order_status = case when order_status = 'awaiting_confirmation' then 'confirmed'::order_status else order_status end,
      payment_resolution_required = false,
      payment_resolution_reason = null,
      refund_note = coalesce(p_note, refund_note)
    where id = p_order_id
    returning * into v_order;
  else
    update orders set
      payment_resolution_required = false,
      refund_note = coalesce(p_note, refund_note)
    where id = p_order_id
    returning * into v_order;
  end if;

  return json_build_object('order_status', v_order.order_status,
                           'payment_status', v_order.payment_status,
                           'payment_resolution_required', v_order.payment_resolution_required);
end;
$$;
