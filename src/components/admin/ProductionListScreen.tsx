"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/status";
import type {
  EditionOption,
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  WindowType,
} from "@/lib/types";

interface ProductionItem {
  product_name_snapshot: string;
  doneness: string | null;
  customer_note: string | null;
  qty: number;
}

interface ProductionOrder {
  id: string;
  customer_name: string;
  whatsapp: string;
  fulfillment_type: FulfillmentType;
  window_id: string | null;
  window_label_snapshot: string;
  order_status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  created_at: string;
  order_items: ProductionItem[];
}

interface ProductionWindow {
  id: string;
  label: string;
  type: WindowType;
  starts_at: string;
}

interface DragState {
  order: ProductionOrder;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  overStatus: OrderStatus | null;
}

export function ProductionListScreen({
  editions,
  selectedEditionId,
  windows,
  orders: initialOrders,
}: {
  editions: EditionOption[];
  selectedEditionId: string;
  windows: ProductionWindow[];
  orders: ProductionOrder[];
}) {
  const router = useRouter();
  const { confirmDialog } = useDialog();
  const [orders, setOrders] = useState(initialOrders);
  const [view, setView] = useState<"janela" | "kanban">("janela");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-production-${channelSuffix}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
          if (payload.eventType === "DELETE") {
            setOrders((prev) => prev.filter((o) => o.id !== (payload.old as { id: string }).id));
            return;
          }
          const updated = payload.new as ProductionOrder;
          setOrders((prev) => {
            if (!prev.some((o) => o.id === updated.id)) return prev;
            return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
          });
        })
        .subscribe();
    }

    start();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      authSubscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function moveOrderTo(order: ProductionOrder, next: OrderStatus) {
    if (next === order.order_status) return;
    if (
      order.payment_method === "pix" &&
      order.payment_status === "pending" &&
      (next === "out_for_delivery" || next === "delivered")
    ) {
      const ok = await confirmDialog({
        title: "Pagamento ainda pendente",
        message:
          "Este pedido é Pix e ainda não foi marcado como pago. Confirmar mesmo assim que o pagamento foi recebido fora do sistema?",
        confirmLabel: "Sim, já recebi",
      });
      if (!ok) return;
    }
    setMovingId(order.id);
    const supabase = createClient();
    const { error } = await supabase.from("orders").update({ order_status: next }).eq("id", order.id);
    setMovingId(null);
    if (!error) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, order_status: next } : o)));
      if (next === "confirmed") {
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id }),
        }).catch(() => {});
      }
    }
  }

  function advanceOrder(order: ProductionOrder) {
    const next = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(order.order_status) + 1];
    if (next) moveOrderTo(order, next);
  }

  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>, order: ProductionOrder) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button")) return;
    const cardEl = e.currentTarget;
    const rect = cardEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;

    const timer = window.setTimeout(() => {
      activated = true;
      const next: DragState = {
        order,
        width: rect.width,
        height: rect.height,
        offsetX: startX - rect.left,
        offsetY: startY - rect.top,
        x: rect.left,
        y: rect.top,
        overStatus: null,
      };
      dragRef.current = next;
      setDrag(next);
    }, 150);

    function onMove(ev: PointerEvent) {
      if (!activated) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
          window.clearTimeout(timer);
          cleanup();
        }
        return;
      }
      ev.preventDefault();
      const current = dragRef.current;
      if (!current) return;
      const x = ev.clientX - current.offsetX;
      const y = ev.clientY - current.offsetY;
      const overEl = document.elementFromPoint(ev.clientX, ev.clientY);
      const columnEl = overEl?.closest<HTMLElement>("[data-kanban-status]");
      const overStatus = (columnEl?.dataset.kanbanStatus as OrderStatus | undefined) ?? null;
      const updated = { ...current, x, y, overStatus };
      dragRef.current = updated;
      setDrag(updated);
    }

    function onUp() {
      window.clearTimeout(timer);
      cleanup();
      const final = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (activated && final?.overStatus && final.overStatus !== final.order.order_status) {
        moveOrderTo(final.order, final.overStatus);
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const groups = useMemo(() => {
    const byKey = new Map<
      string,
      { label: string; type: WindowType; startsAt: string | null; orders: ProductionOrder[] }
    >();

    for (const w of windows) {
      byKey.set(w.id, { label: w.label, type: w.type, startsAt: w.starts_at, orders: [] });
    }

    for (const order of orders) {
      const key = order.window_id ?? `label:${order.window_label_snapshot}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          label: order.window_label_snapshot,
          type: order.fulfillment_type,
          startsAt: null,
          orders: [],
        });
      }
      byKey.get(key)!.orders.push(order);
    }

    return [...byKey.values()]
      .filter((g) => g.orders.length > 0)
      .sort((a, b) => {
        if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
        if (a.startsAt) return -1;
        if (b.startsAt) return 1;
        return a.label.localeCompare(b.label);
      })
      .map((g) => {
        const sortedOrders = [...g.orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const summaryMap = new Map<string, { name: string; doneness: string; note: string; qty: number }>();
        let totalQty = 0;
        for (const order of sortedOrders) {
          for (const item of order.order_items) {
            const doneness = item.doneness ?? "Ponto da casa";
            const note = item.customer_note ?? "";
            const key = `${item.product_name_snapshot}||${doneness}||${note}`;
            const existing = summaryMap.get(key);
            if (existing) {
              existing.qty += item.qty;
            } else {
              summaryMap.set(key, { name: item.product_name_snapshot, doneness, note, qty: item.qty });
            }
            totalQty += item.qty;
          }
        }
        const summary = [...summaryMap.values()].sort(
          (a, b) => a.name.localeCompare(b.name) || a.doneness.localeCompare(b.doneness)
        );
        return { ...g, orders: sortedOrders, summary, totalQty };
      });
  }, [windows, orders]);

  const kanbanColumns = useMemo(() => {
    return ORDER_STATUS_FLOW.map((status) => ({
      status,
      orders: orders
        .filter((o) => o.order_status === status)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }));
  }, [orders]);

  const grandTotal = groups.reduce((sum, g) => sum + g.totalQty, 0);

  return (
    <div id="production-full-width" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-coffee">Lista de produção</h1>
          <p className="text-sm text-coffee-soft">
            {grandTotal > 0
              ? `${grandTotal} hambúrguer${grandTotal === 1 ? "" : "es"} · ${orders.length} pedido${orders.length === 1 ? "" : "s"}`
              : "Nenhum pedido nesta edição ainda."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-cream-soft p-1">
            <button
              onClick={() => setView("janela")}
              className={`min-h-9 rounded-full px-3.5 text-sm font-bold transition-colors ${
                view === "janela" ? "bg-orange text-white" : "text-coffee-soft"
              }`}
            >
              Por janela
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`min-h-9 rounded-full px-3.5 text-sm font-bold transition-colors ${
                view === "kanban" ? "bg-orange text-white" : "text-coffee-soft"
              }`}
            >
              Kanban
            </button>
          </div>
          <select
            value={selectedEditionId}
            onChange={(e) => router.push(`/admin/producao?edition=${e.target.value}`)}
            className="input w-auto"
          >
            {editions.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {view === "kanban" ? (
        orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
            Nenhum pedido para listar nesta edição.
          </div>
        ) : (
          <>
            <p className="-mt-1 text-xs text-coffee-soft/70">
              Segure e arraste um pedido para outra coluna, ou use o botão para avançar uma etapa.
            </p>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {kanbanColumns.map((col) => (
                <div
                  key={col.status}
                  data-kanban-status={col.status}
                  className={`flex w-[260px] shrink-0 flex-col gap-2.5 rounded-2xl p-3 transition-colors ${
                    drag && drag.overStatus === col.status && drag.order.order_status !== col.status
                      ? "bg-orange-soft"
                      : "bg-cream-soft/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-sm font-extrabold text-coffee">
                      {ORDER_STATUS_LABEL[col.status]}
                    </h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-coffee-soft">
                      {col.orders.length}
                    </span>
                  </div>
                  <div className="flex min-h-[40px] flex-col gap-2">
                    {col.orders.map((order) => {
                      const nextStatus = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(order.order_status) + 1];
                      const isDragging = drag?.order.id === order.id;
                      return (
                        <div
                          key={order.id}
                          onPointerDown={(e) => handleCardPointerDown(e, order)}
                          className={`flex touch-none flex-col gap-2 rounded-xl bg-white p-3 shadow-sm transition-opacity ${
                            isDragging ? "opacity-30" : "cursor-grab active:cursor-grabbing"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold text-coffee">{order.customer_name}</p>
                            <p className="text-xs text-coffee-soft">{order.window_label_snapshot}</p>
                          </div>
                          <ul className="flex flex-col gap-0.5">
                            {order.order_items.map((item, i) => (
                              <li key={i} className="text-xs text-coffee-soft">
                                <span className="font-bold text-coffee">{item.qty}×</span>{" "}
                                {item.product_name_snapshot}
                                {item.customer_note && (
                                  <span className="italic"> · &ldquo;{item.customer_note}&rdquo;</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {nextStatus && (
                            <button
                              onClick={() => advanceOrder(order)}
                              disabled={movingId === order.id}
                              className="min-h-9 rounded-lg bg-orange-soft px-2.5 py-1.5 text-xs font-bold text-orange-dark disabled:opacity-50"
                            >
                              {movingId === order.id
                                ? "Movendo…"
                                : `Mover para "${ORDER_STATUS_LABEL[nextStatus]}" →`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {col.orders.length === 0 && (
                      <p className="px-1 text-xs text-coffee-soft/70">Vazio</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {drag && (
              <div
                className="pointer-events-none fixed z-50 flex flex-col gap-2 rounded-xl bg-white p-3 shadow-2xl ring-2 ring-orange"
                style={{
                  left: drag.x,
                  top: drag.y,
                  width: drag.width,
                  transform: "scale(1.03) rotate(1deg)",
                }}
              >
                <div>
                  <p className="text-sm font-bold text-coffee">{drag.order.customer_name}</p>
                  <p className="text-xs text-coffee-soft">{drag.order.window_label_snapshot}</p>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {drag.order.order_items.map((item, i) => (
                    <li key={i} className="text-xs text-coffee-soft">
                      <span className="font-bold text-coffee">{item.qty}×</span>{" "}
                      {item.product_name_snapshot}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
          Nenhum pedido para listar nesta edição.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-3 rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-coffee">{group.label}</h2>
                  <p className="text-xs text-coffee-soft">
                    {group.totalQty} burger{group.totalQty === 1 ? "" : "s"} · {group.orders.length} pedido
                    {group.orders.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge tone={group.type === "delivery" ? "info" : "warning"}>
                  {group.type === "delivery" ? "Entrega" : "Retirada"}
                </Badge>
              </div>

              <div className="rounded-xl bg-cream-soft p-3">
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-coffee-soft">
                  Resumo para produção
                </p>
                <ul className="flex flex-col gap-1">
                  {group.summary.map((s) => (
                    <li key={`${s.name}||${s.doneness}||${s.note}`} className="text-sm leading-snug text-coffee">
                      <span className="font-extrabold text-orange-dark">{s.qty}×</span>{" "}
                      <span className="font-bold">{s.name}</span>
                      <span className="text-coffee-soft"> — {s.doneness}</span>
                      {s.note && (
                        <span className="italic text-coffee-soft"> · &ldquo;{s.note}&rdquo;</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-coffee-soft">
                  Pedidos, por ordem de chegada
                </p>
                {group.orders.map((order, idx) => (
                  <div key={order.id} className="rounded-xl border border-coffee/10 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-coffee">
                        {idx + 1}. {order.customer_name}
                      </p>
                      <Badge tone={ORDER_STATUS_TONE[order.order_status]}>
                        {ORDER_STATUS_LABEL[order.order_status]}
                      </Badge>
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {order.order_items.map((item, itemIdx) => (
                        <li key={itemIdx} className="text-sm text-coffee-soft">
                          <span className="font-bold text-coffee">{item.qty}×</span>{" "}
                          {item.product_name_snapshot} — {item.doneness ?? "Ponto da casa"}
                          {item.customer_note && (
                            <span className="italic"> · &ldquo;{item.customer_note}&rdquo;</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
