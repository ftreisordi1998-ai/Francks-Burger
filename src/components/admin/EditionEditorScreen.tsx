"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import { formatCents } from "@/lib/format";
import type { DeliveryWindow, Edition, EditionStatus, Neighborhood, Product, WindowType } from "@/lib/types";
import { ProductsManager } from "./ProductsManager";
import { WindowsManager } from "./WindowsManager";
import { NeighborhoodsManager } from "./NeighborhoodsManager";

const EDITABLE_FIELDS = [
  "title",
  "status",
  "prep_date",
  "order_deadline",
  "reservation_expiry_minutes",
  "payment_deadline_hours",
  "pix_key",
  "pix_recipient_name",
  "pix_city",
  "accepts_card_on_delivery",
  "accepts_cash_on_delivery",
  "pickup_enabled",
  "pickup_address",
  "notes_public",
] as const;

function pickEditable(edition: Edition) {
  const picked: Partial<Edition> = {};
  for (const key of EDITABLE_FIELDS) {
    (picked as Record<string, unknown>)[key] = edition[key];
  }
  return picked;
}

interface StatsOrderItem {
  product_id: string;
  qty: number;
  orders: { order_status: string; payment_status: string };
}

interface StatsOrder {
  order_status: string;
  payment_status: string;
  total_cents: number;
  delivery_fee_cents: number;
}

export function EditionEditorScreen({
  edition: initialEdition,
  initialProducts,
  initialWindows,
  initialNeighborhoods,
  orderItemsForStats,
  orders,
}: {
  edition: Edition;
  initialProducts: Product[];
  initialWindows: DeliveryWindow[];
  initialNeighborhoods: Neighborhood[];
  orderItemsForStats: StatsOrderItem[];
  orders: StatsOrder[];
}) {
  const [edition, setEdition] = useState(initialEdition);
  const [savedEdition, setSavedEdition] = useState(initialEdition);
  const [products, setProducts] = useState(initialProducts);
  const [windows, setWindows] = useState(initialWindows);
  const [neighborhoods, setNeighborhoods] = useState(initialNeighborhoods);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const router = useRouter();
  const { alertDialog } = useDialog();

  const dirty = useMemo(
    () => JSON.stringify(pickEditable(edition)) !== JSON.stringify(pickEditable(savedEdition)),
    [edition, savedEdition]
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function saveAll() {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("editions")
      .update(pickEditable(edition))
      .eq("id", edition.id)
      .select("*")
      .single();
    setSaving(false);
    if (!error && data) {
      setEdition(data as Edition);
      setSavedEdition(data as Edition);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3500);
    } else {
      await alertDialog({
        title: "Não foi possível salvar",
        message: "Tente novamente em instantes.",
        tone: "danger",
      });
    }
  }

  function discardChanges() {
    setEdition(savedEdition);
  }

  const activeOrders = orders.filter((o) => o.order_status !== "cancelled");
  const totalReceived = activeOrders
    .filter((o) => o.payment_status === "paid")
    .reduce((s, o) => s + o.total_cents, 0);
  const totalPending = activeOrders
    .filter((o) => o.payment_status === "pending")
    .reduce((s, o) => s + o.total_cents, 0);
  const totalDeliveryFees = activeOrders.reduce((s, o) => s + o.delivery_fee_cents, 0);

  const perProduct = useMemo(() => {
    const map = new Map<string, { reserved: number; confirmed: number }>();
    for (const item of orderItemsForStats) {
      if (item.orders.order_status === "cancelled") continue;
      const entry = map.get(item.product_id) ?? { reserved: 0, confirmed: 0 };
      entry.reserved += item.qty;
      if (item.orders.order_status !== "awaiting_confirmation") entry.confirmed += item.qty;
      map.set(item.product_id, entry);
    }
    return map;
  }, [orderItemsForStats]);

  async function duplicateEdition() {
    const supabase = createClient();
    const { data: newEdition, error } = await supabase
      .from("editions")
      .insert({
        title: `${edition.title} (cópia)`,
        prep_date: edition.prep_date,
        order_deadline: edition.order_deadline,
        status: "draft",
        reservation_expiry_minutes: edition.reservation_expiry_minutes,
        payment_deadline_hours: edition.payment_deadline_hours,
        pix_key: edition.pix_key,
        pix_recipient_name: edition.pix_recipient_name,
        pix_city: edition.pix_city,
        accepts_card_on_delivery: edition.accepts_card_on_delivery,
        accepts_cash_on_delivery: edition.accepts_cash_on_delivery,
        pickup_enabled: edition.pickup_enabled,
        pickup_address: edition.pickup_address,
        notes_public: edition.notes_public,
      })
      .select("id")
      .single();
    if (error || !newEdition) return;

    if (products.length > 0) {
      await supabase.from("products").insert(
        products.map((p) => ({
          edition_id: newEdition.id,
          name: p.name,
          description: p.description,
          price_cents: p.price_cents,
          image_url: p.image_url,
          stock_qty: p.stock_qty,
          available_qty: p.stock_qty,
          sort_order: p.sort_order,
          active: p.active,
        }))
      );
    }
    if (windows.length > 0) {
      await supabase.from("delivery_windows").insert(
        windows.map((w) => ({
          edition_id: newEdition.id,
          type: w.type,
          label: w.label,
          starts_at: w.starts_at,
          ends_at: w.ends_at,
          capacity_burgers: w.capacity_burgers,
          reserved_burgers: 0,
          active: w.active,
        }))
      );
    }
    if (neighborhoods.length > 0) {
      await supabase.from("neighborhoods").insert(
        neighborhoods.map((n) => ({
          edition_id: newEdition.id,
          name: n.name,
          delivery_fee_cents: n.delivery_fee_cents,
          active: n.active,
        }))
      );
    }
    router.push(`/admin/edicoes/${newEdition.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href="/admin/edicoes" className="text-sm font-semibold text-coffee-soft">
        ← Voltar às edições
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <input
          value={edition.title}
          onChange={(e) => setEdition({ ...edition, title: e.target.value })}
          className="rounded-xl bg-transparent text-xl font-extrabold text-coffee outline-none focus:bg-white focus:px-2 focus:py-1"
        />
        <div className="flex gap-2">
          <button
            onClick={duplicateEdition}
            className="rounded-xl bg-cream-soft px-3.5 py-2 text-sm font-bold text-coffee"
          >
            Duplicar
          </button>
          {edition.status !== "closed" && (
            <button
              onClick={() => setEdition({ ...edition, status: "closed" as EditionStatus })}
              className="rounded-xl bg-danger-bg px-3.5 py-2 text-sm font-bold text-danger"
            >
              Encerrar
            </button>
          )}
        </div>
      </div>

      {justSaved && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-success-bg px-4 py-3 text-sm font-semibold text-success">
          Alterações salvas — já está no ar.
          <Link href="/" target="_blank" className="underline">
            Ver na página principal ↗
          </Link>
        </div>
      )}

      <section className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 sm:grid-cols-4">
        <Stat label="Recebido" value={formatCents(totalReceived)} />
        <Stat label="Pendente" value={formatCents(totalPending)} />
        <Stat label="Taxas de entrega" value={formatCents(totalDeliveryFees)} />
        <Stat label="Pedidos ativos" value={String(activeOrders.length)} />
      </section>

      <section className="mt-4 flex flex-col gap-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Configurações
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Situação">
            <select
              value={edition.status}
              onChange={(e) => setEdition({ ...edition, status: e.target.value as EditionStatus })}
              className="input"
            >
              <option value="draft">Rascunho (não visível)</option>
              <option value="open">Aberta</option>
              <option value="closed">Encerrada</option>
            </select>
          </Field>
          <Field label="Data de preparo">
            <input
              type="date"
              value={edition.prep_date}
              onChange={(e) => setEdition({ ...edition, prep_date: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Prazo para encomendar">
            <input
              type="datetime-local"
              value={toLocalInput(edition.order_deadline)}
              onChange={(e) =>
                setEdition({ ...edition, order_deadline: new Date(e.target.value).toISOString() })
              }
              className="input"
            />
          </Field>
          <Field label="Minutos para expirar reserva não paga">
            <input
              type="number"
              min={5}
              value={edition.reservation_expiry_minutes}
              onChange={(e) =>
                setEdition({ ...edition, reservation_expiry_minutes: Number(e.target.value) })
              }
              className="input"
            />
          </Field>
          <Field label="Prazo de pagamento (horas, opcional)">
            <input
              type="number"
              min={1}
              value={edition.payment_deadline_hours ?? ""}
              onChange={(e) =>
                setEdition({
                  ...edition,
                  payment_deadline_hours: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="input"
            />
          </Field>
          <Field label="Chave Pix">
            <input
              value={edition.pix_key ?? ""}
              onChange={(e) => setEdition({ ...edition, pix_key: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Nome do recebedor Pix">
            <input
              value={edition.pix_recipient_name ?? ""}
              onChange={(e) => setEdition({ ...edition, pix_recipient_name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Cidade (para o QR Code Pix)">
            <input
              value={edition.pix_city ?? ""}
              onChange={(e) => setEdition({ ...edition, pix_city: e.target.value })}
              placeholder="Ex: São Paulo"
              className="input"
            />
          </Field>
          <Field label="Observação pública (opcional)" className="sm:col-span-2">
            <textarea
              value={edition.notes_public ?? ""}
              onChange={(e) => setEdition({ ...edition, notes_public: e.target.value })}
              rows={2}
              className="input resize-none"
            />
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs font-semibold text-coffee-soft">
              Outras formas de pagamento (além do Pix)
            </span>
            <label className="flex items-center gap-2 text-sm text-coffee">
              <input
                type="checkbox"
                checked={edition.accepts_card_on_delivery}
                onChange={(e) =>
                  setEdition({ ...edition, accepts_card_on_delivery: e.target.checked })
                }
              />
              Aceitar cartão na entrega/retirada
            </label>
            <label className="flex items-center gap-2 text-sm text-coffee">
              <input
                type="checkbox"
                checked={edition.accepts_cash_on_delivery}
                onChange={(e) =>
                  setEdition({ ...edition, accepts_cash_on_delivery: e.target.checked })
                }
              />
              Aceitar dinheiro na entrega/retirada
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-coffee">
              <input
                type="checkbox"
                checked={edition.pickup_enabled}
                onChange={(e) => setEdition({ ...edition, pickup_enabled: e.target.checked })}
              />
              Ativar retirada para os clientes
            </label>
            <p className="text-xs text-coffee-soft">
              Enquanto desativado, o site só oferece entrega — mesmo que existam janelas de
              retirada cadastradas abaixo.
            </p>
          </div>
          <Field label="Endereço de retirada" className="sm:col-span-2">
            <input
              value={edition.pickup_address ?? ""}
              onChange={(e) => setEdition({ ...edition, pickup_address: e.target.value })}
              placeholder="Rua, número — Cidade, UF"
              className="input"
            />
          </Field>
        </div>
      </section>

      <ProductsManager
        editionId={edition.id}
        products={products}
        onChange={setProducts}
        perProductStats={perProduct}
      />

      <WindowsManager editionId={edition.id} windows={windows} onChange={setWindows} />

      <NeighborhoodsManager
        editionId={edition.id}
        neighborhoods={neighborhoods}
        onChange={setNeighborhoods}
      />

      <div className="h-24" />

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-coffee/10 bg-cream/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm font-semibold text-coffee-soft">Você tem alterações não salvas</span>
            <div className="flex gap-2">
              <button
                onClick={discardChanges}
                disabled={saving}
                className="rounded-xl bg-cream-soft px-4 py-2.5 text-sm font-bold text-coffee-soft disabled:opacity-50"
              >
                Descartar
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="rounded-xl bg-orange px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange/20 disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 12px;
          background: var(--color-cream-soft);
          padding: 10px 12px;
          font-size: 16px;
          color: var(--color-coffee);
        }
        .input:focus {
          outline: 2px solid var(--color-orange);
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-coffee-soft">{label}</p>
      <p className="text-lg font-extrabold text-coffee">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-coffee-soft">{label}</span>
      {children}
    </label>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export type { WindowType };
