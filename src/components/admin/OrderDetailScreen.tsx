"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateTime } from "@/lib/format";
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";
import type { AdminOrderRow, OrderStatus } from "@/lib/types";

interface OrderItemRow {
  id: string;
  product_name_snapshot: string;
  qty: number;
  unit_price_cents_snapshot: number;
  line_total_cents: number;
  doneness: string | null;
  customer_note: string | null;
}

export function OrderDetailScreen({
  order: initial,
  items,
}: {
  order: AdminOrderRow;
  items: OrderItemRow[];
}) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [notifyState, setNotifyState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const router = useRouter();
  const { confirmDialog, alertDialog } = useDialog();

  const whatsappDigits = order.whatsapp.replace(/\D/g, "");
  const whatsappUrl = `https://wa.me/55${whatsappDigits}`;

  const groupedItems = useMemo(() => {
    const order_: string[] = [];
    const groups = new Map<string, { name: string; lines: OrderItemRow[]; totalQty: number }>();
    for (const item of items) {
      if (!groups.has(item.product_name_snapshot)) {
        order_.push(item.product_name_snapshot);
        groups.set(item.product_name_snapshot, {
          name: item.product_name_snapshot,
          lines: [],
          totalQty: 0,
        });
      }
      const g = groups.get(item.product_name_snapshot)!;
      g.lines.push(item);
      g.totalQty += item.qty;
    }
    return order_.map((name) => groups.get(name)!);
  }, [items]);

  async function confirmPayment() {
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .update({ payment_status: "paid", payment_confirmed_at: new Date().toISOString() })
      .eq("id", order.id)
      .select("*, editions(title, prep_date)")
      .single();
    if (data) setOrder(data as unknown as AdminOrderRow);
    setBusy(false);
  }

  async function advanceStatus(next: OrderStatus) {
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .update({ order_status: next })
      .eq("id", order.id)
      .select("*, editions(title, prep_date)")
      .single();
    if (data) setOrder(data as unknown as AdminOrderRow);
    setBusy(false);
    if (next === "confirmed") {
      notifyCustomer();
    }
  }

  async function notifyCustomer() {
    setNotifyState("sending");
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      if (!res.ok) throw new Error();
      setNotifyState("sent");
      setOrder((o) => ({ ...o, confirmation_notified_at: new Date().toISOString() }));
    } catch {
      setNotifyState("error");
    }
  }

  async function cancelOrder() {
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("admin_cancel_order", {
      p_order_id: order.id,
      p_reason: cancelReason || "Cancelado pelo administrador",
    });
    router.refresh();
    setBusy(false);
    setShowCancel(false);
  }

  async function deleteOrder() {
    const ok = await confirmDialog({
      title: "Excluir este pedido?",
      message:
        "Isso apaga o pedido para sempre (diferente de cancelar). Se ele ainda tiver estoque ou horário reservado, isso é liberado automaticamente. Não pode ser desfeito.",
      confirmLabel: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_order", { p_order_id: order.id });
    setBusy(false);
    if (error) {
      await alertDialog({
        title: "Não foi possível excluir",
        message: "Tente novamente em instantes.",
        tone: "danger",
      });
      return;
    }
    router.push("/admin/pedidos");
  }

  const currentIdx = ORDER_STATUS_FLOW.indexOf(order.order_status);
  const nextStatus = currentIdx >= 0 ? ORDER_STATUS_FLOW[currentIdx + 1] : undefined;
  const isCancelled = order.order_status === "cancelled";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/pedidos" className="text-sm font-semibold text-coffee-soft">
        ← Voltar aos pedidos
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-coffee">{order.customer_name}</h1>
          <p className="text-sm text-coffee-soft">{order.whatsapp}</p>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-success-bg px-3 py-2 text-sm font-bold text-success"
        >
          Abrir WhatsApp
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={PAYMENT_STATUS_TONE[order.payment_status]}>
          {PAYMENT_STATUS_LABEL[order.payment_status]}
        </Badge>
        <Badge tone={ORDER_STATUS_TONE[order.order_status]}>
          {ORDER_STATUS_LABEL[order.order_status]}
        </Badge>
        <Badge tone="info">{PAYMENT_METHOD_LABEL[order.payment_method]}</Badge>
      </div>

      {order.payment_method === "cash" && (
        <div className="mt-3 rounded-xl bg-orange-soft px-4 py-3 text-sm font-semibold text-orange-dark">
          {order.cash_change_for_cents
            ? `Cliente paga com ${formatCents(order.cash_change_for_cents)} — levar troco de ${formatCents(order.cash_change_for_cents - order.total_cents)}`
            : "Cliente vai pagar com o valor exato — sem troco"}
        </div>
      )}

      {order.payment_status === "refund_pending" && (
        <div className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          Reembolso pendente — este pedido foi pago e depois cancelado. Confirme o
          estorno manualmente e atualize o status.
        </div>
      )}

      <section className="mt-4 rounded-2xl bg-white p-4">
        <p className="text-sm font-bold text-coffee">{order.editions?.title}</p>
        <p className="mt-1 text-sm text-coffee-soft">
          {order.fulfillment_type === "delivery" ? "Entrega" : "Retirada"} ·{" "}
          {order.window_label_snapshot}
        </p>
        {order.fulfillment_type === "delivery" && (
          <p className="mt-1 text-sm text-coffee-soft">
            {order.address_street}, {order.address_number}
            {order.address_complement ? ` — ${order.address_complement}` : ""}
            {order.address_reference ? ` (${order.address_reference})` : ""} ·{" "}
            {order.neighborhood_name_snapshot}
          </p>
        )}
        {order.notes && (
          <p className="mt-2 rounded-lg bg-cream-soft px-3 py-2 text-sm text-coffee-soft">
            Obs: {order.notes}
          </p>
        )}
        <p className="mt-2 text-xs text-coffee-soft/70">
          Criado em {formatDateTime(order.created_at)}
        </p>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">Itens</h2>
        <div className="mt-2 flex flex-col gap-3">
          {groupedItems.map((group) => (
            <div key={group.name} className="flex flex-col gap-1.5">
              <p className="text-sm font-extrabold text-coffee">
                {group.name}
                {group.lines.length > 1 && (
                  <span className="ml-1.5 font-normal text-coffee-soft">
                    · {group.totalQty} unidades
                  </span>
                )}
              </p>
              {group.lines.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col gap-0.5 text-sm ${
                    group.lines.length > 1
                      ? "rounded-lg border border-orange/20 bg-orange-soft/25 px-2.5 py-1.5"
                      : ""
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-bold text-coffee">
                      {item.qty}× {item.doneness ?? "Ponto da casa"}
                    </span>
                    <span className="font-semibold text-coffee">
                      {formatCents(item.line_total_cents)}
                    </span>
                  </div>
                  {item.customer_note && (
                    <span className="text-xs italic text-coffee-soft">
                      &ldquo;{item.customer_note}&rdquo;
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-cream-soft pt-2 text-sm">
          <div className="flex justify-between text-coffee-soft">
            <span>Subtotal</span>
            <span>{formatCents(order.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-coffee-soft">
            <span>Taxa de entrega</span>
            <span>{formatCents(order.delivery_fee_cents)}</span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-coffee">
            <span>Total</span>
            <span>{formatCents(order.total_cents)}</span>
          </div>
        </div>
      </section>

      {!isCancelled && (
        <section className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">Ações</h2>
          <div className="flex flex-wrap gap-2">
            {order.payment_status === "pending" && (
              <ActionButton onClick={confirmPayment} disabled={busy}>
                Confirmar pagamento
              </ActionButton>
            )}
            {nextStatus && (
              <ActionButton onClick={() => advanceStatus(nextStatus)} disabled={busy}>
                Marcar como &ldquo;{ORDER_STATUS_LABEL[nextStatus]}&rdquo;
              </ActionButton>
            )}
            <ActionButton
              onClick={notifyCustomer}
              disabled={busy || notifyState === "sending"}
              variant="ghost"
            >
              {notifyState === "sending"
                ? "Enviando…"
                : order.confirmation_notified_at
                  ? "Reenviar notificação"
                  : "Notificar cliente"}
            </ActionButton>
            <ActionButton onClick={() => setShowCancel(true)} disabled={busy} variant="danger">
              Cancelar pedido
            </ActionButton>
          </div>
          {notifyState === "sent" && (
            <p className="text-xs font-semibold text-success">
              Notificação enviada ao cliente.
            </p>
          )}
          {notifyState === "error" && (
            <p className="text-xs font-semibold text-danger">
              Não foi possível enviar — o cliente talvez não tenha ativado notificações.
            </p>
          )}
          {order.confirmation_notified_at && notifyState === "idle" && (
            <p className="text-xs text-coffee-soft">
              Notificado em {formatDateTime(order.confirmation_notified_at)}.
            </p>
          )}

          {showCancel && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-danger-bg p-3">
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motivo do cancelamento (opcional)"
                className="rounded-lg border border-danger/20 bg-white px-3 py-2 text-sm"
                style={{ fontSize: 16 }}
              />
              <div className="flex gap-2">
                <ActionButton onClick={cancelOrder} disabled={busy} variant="danger">
                  Confirmar cancelamento
                </ActionButton>
                <ActionButton onClick={() => setShowCancel(false)} disabled={busy} variant="ghost">
                  Voltar
                </ActionButton>
              </div>
            </div>
          )}
        </section>
      )}

      {isCancelled && order.cancel_reason && (
        <section className="mt-4 rounded-2xl bg-white p-4 text-sm text-coffee-soft">
          Cancelado: {order.cancel_reason}
        </section>
      )}

      <section className="mt-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Zona de risco
        </h2>
        <p className="mt-1 text-xs text-coffee-soft">
          Excluir apaga o pedido permanentemente do histórico — diferente de cancelar.
        </p>
        <button
          onClick={deleteOrder}
          disabled={busy}
          className="mt-3 rounded-xl bg-danger-bg px-4 py-2.5 text-sm font-bold text-danger disabled:opacity-50"
        >
          Excluir pedido
        </button>
      </section>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant = "primary",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
  children: React.ReactNode;
}) {
  const styles = {
    primary: "bg-orange text-white",
    danger: "bg-danger text-white",
    ghost: "bg-cream-soft text-coffee-soft",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
