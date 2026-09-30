"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Badge } from "./Badge";
import { createClient } from "@/lib/supabase/client";
import { useSwipeBack } from "@/lib/useSwipeBack";
import { PixPayment } from "./PixPayment";
import {
  getExistingPushSubscription,
  isAndroid,
  isPushSupported,
  subscribeToOrderPush,
} from "@/lib/push";
import { formatCents, formatDateShort, formatDateTime } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";
import type { OrderTrackingView } from "@/lib/types";

type PushCardState = "hidden" | "offer" | "subscribed" | "denied" | "error";

export function OrderTrackingScreen({ order: initial }: { order: OrderTrackingView }) {
  const [order, setOrder] = useState(initial);
  const [pushState, setPushState] = useState<PushCardState>("hidden");
  const [pushBusy, setPushBusy] = useState(false);
  const router = useRouter();
  useSwipeBack(() => router.push("/"));

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    getExistingPushSubscription().then((sub) => {
      setPushState(sub ? "subscribed" : "offer");
    });
  }, []);

  async function handleEnableNotifications() {
    setPushBusy(true);
    try {
      await subscribeToOrderPush(order.public_token);
      setPushState("subscribed");
    } catch (err) {
      setPushState(err instanceof Error && err.message === "PERMISSION_DENIED" ? "denied" : "error");
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    // Pedidos não têm leitura pública por segurança (evita listar/vasculhar
    // encomendas de outras pessoas), então o Realtime do Postgres não enxerga
    // mudanças aqui. Em vez disso, consultamos periodicamente pelo token secreto.
    const supabase = createClient();
    let cancelled = false;

    async function poll() {
      const { data } = await supabase.rpc("get_order_by_token", {
        p_token: order.public_token,
      });
      if (data && !cancelled) setOrder(data as OrderTrackingView);
    }

    const interval = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [order.public_token]);

  const isPending = order.order_status === "awaiting_confirmation" && order.payment_status === "pending";

  const groupedItems = useMemo(() => {
    const order_: string[] = [];
    const groups = new Map<string, { name: string; lines: typeof order.items; totalQty: number }>();
    for (const item of order.items) {
      if (!groups.has(item.product_name)) {
        order_.push(item.product_name);
        groups.set(item.product_name, { name: item.product_name, lines: [], totalQty: 0 });
      }
      const g = groups.get(item.product_name)!;
      g.lines.push(item);
      g.totalQty += item.qty;
    }
    return order_.map((name) => groups.get(name)!);
  }, [order.items]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-16 pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="flex items-center gap-3">
        <Logo size={44} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-coffee-soft">
            Encomenda
          </p>
          <p className="text-lg font-extrabold text-coffee">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone={ORDER_STATUS_TONE[order.order_status]}>
          {ORDER_STATUS_LABEL[order.order_status]}
        </Badge>
        <Badge tone={PAYMENT_STATUS_TONE[order.payment_status]}>
          {PAYMENT_STATUS_LABEL[order.payment_status]}
        </Badge>
      </div>

      {pushState === "offer" && (
        <section className="mt-4 flex flex-col gap-2 rounded-2xl bg-orange-soft px-4 py-3.5">
          <p className="text-sm font-bold text-orange-dark">Permitir notificações de pedidos</p>
          <p className="text-sm text-coffee">
            {isAndroid()
              ? "Toque em ativar para saber, direto no seu Android, assim que seu pedido for confirmado — sem precisar ficar checando esta página."
              : "Quando o seu pedido for confirmado, você recebe um aviso direto no celular — sem precisar ficar checando esta página."}
          </p>
          <button
            onClick={handleEnableNotifications}
            disabled={pushBusy}
            className="mt-1 self-start rounded-xl bg-orange px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {pushBusy ? "Ativando…" : "Ativar notificações"}
          </button>
        </section>
      )}
      {pushState === "subscribed" && (
        <section className="mt-4 rounded-2xl bg-success-bg px-4 py-3 text-sm font-semibold text-success">
          Notificações ativadas — você será avisado quando seu pedido for confirmado.
        </section>
      )}
      {pushState === "denied" && (
        <section className="mt-4 rounded-2xl bg-cream-soft px-4 py-3 text-xs text-coffee-soft">
          As notificações estão bloqueadas no seu navegador. Para ativar, permita notificações
          para este site nas configurações do celular/navegador.
        </section>
      )}

      <section className="mt-5 rounded-2xl bg-white p-4">
        <p className="text-sm font-bold text-coffee">{order.edition_title}</p>
        <p className="mt-1 text-sm text-coffee-soft">
          Preparo em {formatDateShort(order.edition_prep_date)} · {order.window_label}
        </p>
        {order.fulfillment_type === "delivery" && order.address_street && (
          <p className="mt-1 text-sm text-coffee-soft">
            Entrega: {order.address_street}, {order.address_number}
            {order.address_complement ? ` — ${order.address_complement}` : ""} ·{" "}
            {order.neighborhood_name}
          </p>
        )}
        {order.fulfillment_type === "pickup" && (
          <p className="mt-1 text-sm text-coffee-soft">Retirada no local combinado</p>
        )}
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">Itens</h2>
        <div className="mt-2 flex flex-col gap-3">
          {groupedItems.map((group) => (
            <div key={group.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-coffee">
                  {group.name}
                  {group.lines.length > 1 && (
                    <span className="ml-1.5 font-normal text-coffee-soft">
                      · {group.totalQty} unidades
                    </span>
                  )}
                </span>
              </div>
              {group.lines.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-0.5 text-sm ${
                    group.lines.length > 1 ? "rounded-lg bg-cream-soft px-2.5 py-1.5" : ""
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-coffee-soft">
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
          {order.delivery_fee_cents > 0 && (
            <div className="flex justify-between text-coffee-soft">
              <span>Taxa de entrega</span>
              <span>{formatCents(order.delivery_fee_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-extrabold text-coffee">
            <span>Total</span>
            <span>{formatCents(order.total_cents)}</span>
          </div>
        </div>
      </section>

      {isPending && (
        <section className="mt-4 rounded-2xl bg-orange-soft px-4 py-4">
          {order.payment_method === "pix" && (
            <>
              <h2 className="text-sm font-extrabold text-orange-dark">Pagamento via Pix</h2>
              {order.pix_key ? (
                <>
                  <p className="mt-2 text-sm font-bold text-coffee">
                    Valor: {formatCents(order.total_cents)}
                  </p>
                  <div className="mt-3">
                    <PixPayment
                      pixKey={order.pix_key}
                      recipientName={order.pix_recipient_name ?? "Franck's Burger"}
                      city={order.pix_city ?? "SAO PAULO"}
                      amountCents={order.total_cents}
                      txid={order.id.replace(/-/g, "").slice(0, 25)}
                    />
                  </div>
                  {order.pix_recipient_name && (
                    <p className="mt-3 text-xs text-coffee-soft">
                      Chave Pix: {order.pix_key} · Recebedor: {order.pix_recipient_name}
                    </p>
                  )}
                  {order.payment_deadline_hours && (
                    <p className="mt-2 text-xs text-coffee-soft">
                      Envie o comprovante até {order.payment_deadline_hours}h após o pedido.
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-coffee-soft">
                    Após o pagamento, o responsável confirma manualmente — isso pode levar um
                    tempo.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-coffee-soft">
                  As instruções de pagamento serão enviadas em breve pelo WhatsApp.
                </p>
              )}
            </>
          )}

          {order.payment_method === "card" && (
            <>
              <h2 className="text-sm font-extrabold text-orange-dark">Pagamento com cartão</h2>
              <p className="mt-2 text-sm text-coffee">
                Leve o cartão de débito ou crédito — a maquininha estará na entrega/retirada.
              </p>
              <p className="mt-1 text-sm font-bold text-coffee">
                Valor: {formatCents(order.total_cents)}
              </p>
            </>
          )}

          {order.payment_method === "cash" && (
            <>
              <h2 className="text-sm font-extrabold text-orange-dark">Pagamento em dinheiro</h2>
              <p className="mt-2 text-sm font-bold text-coffee">
                Valor: {formatCents(order.total_cents)}
              </p>
              <p className="mt-1 text-sm text-coffee">
                {order.cash_change_for_cents
                  ? `Você vai pagar com ${formatCents(order.cash_change_for_cents)} — troco de ${formatCents(order.cash_change_for_cents - order.total_cents)}`
                  : "Sem necessidade de troco"}
              </p>
            </>
          )}

          {order.expires_at && (
            <p className="mt-3 text-xs text-coffee-soft">
              Reserva válida até {formatDateTime(order.expires_at)}.
            </p>
          )}
        </section>
      )}

      <p className="mt-6 text-center text-xs text-coffee-soft/70">
        Guarde este link para acompanhar sua encomenda. Ele é pessoal e não deve ser
        compartilhado.
      </p>
    </div>
  );
}
