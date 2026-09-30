"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/status";
import type { EditionOption, FulfillmentType, OrderStatus, WindowType } from "@/lib/types";

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
  created_at: string;
  order_items: ProductionItem[];
}

interface ProductionWindow {
  id: string;
  label: string;
  type: WindowType;
  starts_at: string;
}

export function ProductionListScreen({
  editions,
  selectedEditionId,
  windows,
  orders,
}: {
  editions: EditionOption[];
  selectedEditionId: string;
  windows: ProductionWindow[];
  orders: ProductionOrder[];
}) {
  const router = useRouter();

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

  const grandTotal = groups.reduce((sum, g) => sum + g.totalQty, 0);

  return (
    <div id="production-full-width" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-coffee">Lista de produção</h1>
          <p className="text-sm text-coffee-soft">
            {grandTotal > 0
              ? `${grandTotal} hambúrguer${grandTotal === 1 ? "" : "es"} · agrupados por janela de horário`
              : "Nenhum pedido nesta edição ainda."}
          </p>
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

      {groups.length === 0 ? (
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
