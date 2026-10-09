"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Logo } from "./Logo";
import { Badge } from "./Badge";
import { createClient } from "@/lib/supabase/client";
import { ensureMaplibreWorker } from "@/lib/maplibre-worker-setup";
import { useSwipeBack } from "@/lib/useSwipeBack";
import { PixPayment } from "./PixPayment";
import { PaymentProofUpload } from "./PaymentProofUpload";
import { buildStoreWhatsAppUrl } from "@/lib/contact";
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
import type { ActiveDeliveryPosition, OrderTrackingView } from "@/lib/types";

type PushCardState = "hidden" | "offer" | "subscribed" | "denied" | "error";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export function OrderTrackingScreen({ order: initial }: { order: OrderTrackingView }) {
  const [order, setOrder] = useState(initial);
  const [justSubmittedProof, setJustSubmittedProof] = useState(false);
  const [pushState, setPushState] = useState<PushCardState>("hidden");
  const [pushBusy, setPushBusy] = useState(false);
  const [deliveryPos, setDeliveryPos] = useState<ActiveDeliveryPosition | null>(null);
  const router = useRouter();
  useSwipeBack(() => router.push("/"));

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const prevLngLatRef = useRef<[number, number] | null>(null);

  const showLiveMap =
    order.fulfillment_type === "delivery" && order.order_status === "out_for_delivery";

  useEffect(() => {
    if (!showLiveMap || !MAPBOX_TOKEN) return;
    let cancelled = false;
    const supabase = createClient();

    async function pollPosition() {
      const { data } = await supabase.rpc("get_active_delivery_position", {
        p_edition_id: order.edition_id,
        p_window_id: order.window_id,
      });
      if (!cancelled && data) setDeliveryPos(data as ActiveDeliveryPosition);
    }

    pollPosition();
    const interval = setInterval(pollPosition, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [showLiveMap, order.edition_id, order.window_id]);

  useEffect(() => {
    if (!showLiveMap || !MAPBOX_TOKEN || !deliveryPos?.active || !mapContainerRef.current) return;
    const lngLat: [number, number] = [deliveryPos.lng!, deliveryPos.lat!];

    if (!mapRef.current) {
      ensureMaplibreWorker();
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: lngLat,
        zoom: 16,
        pitch: 0,
        bearing: 0,
        attributionControl: { compact: true },
      });
      const el = document.createElement("div");
      el.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:#e8540f;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);transition:transform 1s linear;";
      el.innerHTML =
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM7 17h6m-3-5 2-5h3l2 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(mapRef.current);
      prevLngLatRef.current = lngLat;
      return;
    }

    const from = prevLngLatRef.current ?? lngLat;
    const to = lngLat;
    prevLngLatRef.current = to;
    const start = performance.now();
    const durationMs = 4500;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const lng = from[0] + (to[0] - from[0]) * t;
      const lat = from[1] + (to[1] - from[1]) * t;
      markerRef.current?.setLngLat([lng, lat]);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    }
    animFrameRef.current = requestAnimationFrame(step);
    mapRef.current.easeTo({ center: to, duration: durationMs });
  }, [deliveryPos, showLiveMap]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

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

  const isPending =
    order.payment_status !== "paid" &&
    order.payment_status !== "refund_pending" &&
    order.payment_status !== "refunded" &&
    order.order_status !== "cancelled";

  async function handleProofSubmitted() {
    setJustSubmittedProof(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_order_by_token", { p_token: order.public_token });
    if (data) setOrder(data as OrderTrackingView);
  }

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

      {justSubmittedProof && (
        <section className="mt-5 rounded-2xl bg-success-bg px-4 py-4">
          <p className="text-base font-extrabold text-success">Comprovante recebido! 🍔❤️</p>
          <p className="mt-2 text-sm leading-relaxed text-coffee">
            Obrigado pela sua encomenda na Franck&rsquo;s Burger! Vamos conferir seu pagamento e
            preparar tudo com muito carinho para você.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-coffee">
            Seu pedido já está registrado. Você pode acompanhar a confirmação por aqui.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-coffee">
            Agora é só deixar a fome de burger com a gente! 🔥
          </p>
        </section>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone={ORDER_STATUS_TONE[order.order_status]}>
          {ORDER_STATUS_LABEL[order.order_status]}
        </Badge>
        <Badge tone={PAYMENT_STATUS_TONE[order.payment_status]}>
          {PAYMENT_STATUS_LABEL[order.payment_status]}
        </Badge>
      </div>

      {showLiveMap && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white">
          {deliveryPos?.active ? (
            <div ref={mapContainerRef} className="h-[220px] w-full" />
          ) : (
            <div className="flex h-[140px] flex-col items-center justify-center gap-1 px-4 text-center">
              <span className="text-2xl">🛵</span>
              <p className="text-sm font-semibold text-coffee-soft">
                Assim que o entregador sair, você vê o trajeto dele aqui ao vivo.
              </p>
            </div>
          )}
        </section>
      )}

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
          {order.fulfillment_type === "delivery" && (
            <div className="flex justify-between text-coffee-soft">
              <span>Taxa de entrega</span>
              <span>
                {order.delivery_fee_cents > 0 ? formatCents(order.delivery_fee_cents) : "Grátis"}
              </span>
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
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-orange-dark/80">
                Pedido #{order.id.slice(0, 8).toUpperCase()}
              </p>
              {order.payment_status === "pending" && order.pix_key ? (
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
              ) : order.payment_status === "pending" ? (
                <p className="mt-2 text-sm text-coffee-soft">
                  As instruções de pagamento serão enviadas em breve pelo WhatsApp.
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-coffee">
                  Valor: {formatCents(order.total_cents)} · Comprovante em conferência
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

      {order.payment_method === "pix" && order.payment_status === "pending" && (
        <PaymentProofUpload publicToken={order.public_token} onSubmitted={handleProofSubmitted} />
      )}

      <a
        href={buildStoreWhatsAppUrl(
          `Oi! Sobre minha encomenda #${order.id.slice(0, 8).toUpperCase()} na Franck's Burger.`
        )}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-success-bg px-4 text-sm font-bold text-success transition active:scale-[0.98]"
      >
        <WhatsAppIcon />
        Falar com a Franck&rsquo;s no WhatsApp
      </a>

      <p className="mt-6 text-center text-xs text-coffee-soft/70">
        Guarde este link para acompanhar sua encomenda. Ele é pessoal e não deve ser
        compartilhado.
      </p>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.33 4.95L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.24c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.41-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.11 1-2.4.26-.29.57-.36.76-.36h.55c.18 0 .42-.03.65.5.25.55.83 2 .9 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.06.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}
