"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateTime } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";
import type { AdminOrderRow, EditionOption, FulfillmentType, OrderStatus, PaymentStatus } from "@/lib/types";

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  "awaiting_confirmation",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];
const CLOSED_ORDER_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

type ProgressFilter = "all" | "open" | "closed";

export function AdminOrdersScreen({
  initialOrders,
  editions,
}: {
  initialOrders: AdminOrderRow[];
  editions: EditionOption[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [editionFilter, setEditionFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentType | "all">("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const { confirmDialog, alertDialog } = useDialog();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refetch() {
      const { data } = await supabase
        .from("orders")
        .select("*, editions(title, prep_date)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (data) setOrders(data as unknown as AdminOrderRow[]);
    }

    async function start() {
      // O cliente do navegador guarda a sessão em cookies (@supabase/ssr), mas o
      // socket do Realtime não herda esse token automaticamente — sem isto, as
      // mudanças na tabela `orders` são silenciosamente bloqueadas pela RLS.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("admin-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
          refetch();
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

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (editionFilter !== "all" && o.edition_id !== editionFilter) return false;
        if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
        if (statusFilter !== "all" && o.order_status !== statusFilter) return false;
        if (fulfillmentFilter !== "all" && o.fulfillment_type !== fulfillmentFilter) return false;
        if (progressFilter === "open" && !OPEN_ORDER_STATUSES.includes(o.order_status)) return false;
        if (progressFilter === "closed" && !CLOSED_ORDER_STATUSES.includes(o.order_status)) return false;
        return true;
      }),
    [orders, editionFilter, paymentFilter, statusFilter, fulfillmentFilter, progressFilter]
  );

  const openCount = orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.order_status)).length;
  const closedCount = orders.filter((o) => CLOSED_ORDER_STATUSES.includes(o.order_status)).length;

  async function handleDelete(e: React.MouseEvent, order: AdminOrderRow) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `Excluir pedido de ${order.customer_name}?`,
      message:
        "Isso apaga o pedido para sempre (diferente de cancelar). Não pode ser desfeito.",
      confirmLabel: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_order", { p_order_id: order.id });
    if (error) {
      await alertDialog({
        title: "Não foi possível excluir",
        message: "Tente novamente em instantes.",
        tone: "danger",
      });
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
  }

  return (
    <div>
      <h1 className="text-xl font-extrabold text-coffee">Pedidos</h1>

      <div className="mt-4 flex justify-center sm:justify-start">
        <div className="inline-flex rounded-full bg-cream-soft p-1">
          <PillButton active={progressFilter === "all"} onClick={() => setProgressFilter("all")}>
            Todos ({orders.length})
          </PillButton>
          <PillButton active={progressFilter === "open"} onClick={() => setProgressFilter("open")}>
            Pedidos abertos ({openCount})
          </PillButton>
          <PillButton active={progressFilter === "closed"} onClick={() => setProgressFilter("closed")}>
            Encerrados ({closedCount})
          </PillButton>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Select value={editionFilter} onChange={setEditionFilter}>
          <option value="all">Todas as edições</option>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
        <Select value={paymentFilter} onChange={(v) => setPaymentFilter(v as PaymentStatus | "all")}>
          <option value="all">Pagamento: todos</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
          <option value="all">Situação: todas</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={fulfillmentFilter}
          onChange={(v) => setFulfillmentFilter(v as FulfillmentType | "all")}
        >
          <option value="all">Entrega e retirada</option>
          <option value="delivery">Entrega</option>
          <option value="pickup">Retirada</option>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.8fr] gap-2 border-b border-cream-soft px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-coffee-soft sm:grid">
          <span>Cliente</span>
          <span>Edição</span>
          <span>Entrega/Retirada</span>
          <span>Pagamento</span>
          <span>Situação</span>
          <span className="text-right">Total</span>
        </div>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-coffee-soft">Nenhum pedido encontrado.</p>
        )}
        {filtered.map((order) => (
          <Link
            key={order.id}
            href={`/admin/pedidos/${order.id}`}
            className="relative grid grid-cols-2 gap-2 border-b border-cream-soft px-4 py-3 pr-10 text-sm last:border-0 hover:bg-cream-soft/50 sm:grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.8fr] sm:items-center sm:pr-12"
          >
            <button
              onClick={(e) => handleDelete(e, order)}
              aria-label="Excluir pedido"
              className="absolute bottom-0 right-3 top-0 my-auto flex h-7 w-7 items-center justify-center rounded-full text-coffee-soft/50 hover:bg-danger-bg hover:text-danger"
            >
              ✕
            </button>
            <div>
              <p className="font-bold text-coffee">{order.customer_name}</p>
              <p className="text-xs text-coffee-soft">{formatDateTime(order.created_at)}</p>
            </div>
            <span className="text-coffee-soft">{order.editions?.title ?? "—"}</span>
            <span className="text-coffee-soft">
              {order.fulfillment_type === "delivery" ? "Entrega" : "Retirada"} ·{" "}
              {order.window_label_snapshot}
            </span>
            <span className="flex flex-col items-start gap-1">
              <Badge tone={PAYMENT_STATUS_TONE[order.payment_status]}>
                {PAYMENT_STATUS_LABEL[order.payment_status]}
              </Badge>
              <span className="text-xs text-coffee-soft">
                {PAYMENT_METHOD_LABEL[order.payment_method]}
              </span>
            </span>
            <span>
              <Badge tone={ORDER_STATUS_TONE[order.order_status]}>
                {ORDER_STATUS_LABEL[order.order_status]}
              </Badge>
            </span>
            <span className="text-right font-bold text-coffee sm:text-right">
              {formatCents(order.total_cents)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
        active ? "bg-orange text-white shadow-sm" : "text-coffee-soft"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-coffee/10 bg-white px-3 py-2 text-sm font-medium text-coffee"
    >
      {children}
    </select>
  );
}
