"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  "opens_at",
  "reservation_expiry_minutes",
  "payment_deadline_hours",
  "pix_key",
  "pix_recipient_name",
  "pix_city",
  "accepts_card_on_delivery",
  "accepts_cash_on_delivery",
  "pickup_enabled",
  "pickup_address",
  "free_delivery",
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
  const savedEditionRef = useRef(initialEdition);
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    savedEditionRef.current = savedEdition;
  }, [savedEdition]);
  const [products, setProducts] = useState(initialProducts);
  const [windows, setWindows] = useState(initialWindows);
  const [neighborhoods, setNeighborhoods] = useState(initialNeighborhoods);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const router = useRouter();
  const { alertDialog, confirmDialog } = useDialog();
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-edition-${initialEdition.id}-${channelSuffix}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "editions", filter: `id=eq.${initialEdition.id}` },
          (payload) => {
            const nextStatus = (payload.new as Edition).status;
            // Só sincroniza a Situação se ninguém estiver com uma troca de status
            // ainda não salva nesta aba — outros campos ficam de fora de propósito,
            // pra um toggle feito em outro lugar nunca sobrescrever uma edição em
            // andamento aqui.
            const wasInSyncWithSaved = savedEditionRef.current.status;
            setSavedEdition((prev) => ({ ...prev, status: nextStatus }));
            setEdition((prev) => (prev.status === wasInSyncWithSaved ? { ...prev, status: nextStatus } : prev));
          }
        )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdition.id]);

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
    .filter((o) => o.payment_status === "pending" || o.payment_status === "proof_submitted")
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
    // Edições são semanais: copiar a data/prazo exatos deixaria a cópia já
    // "vencida" (prazo no passado) assim que criada — adianta tudo em 7 dias
    // por padrão, o admin ainda pode ajustar na tela antes de abrir.
    const addWeek = (iso: string) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    };
    // prep_date é um `date` puro (sem hora) — soma em string evita o fuso
    // horário local deslocar o dia ao converter de/para objeto Date.
    const addWeekToDateOnly = (dateOnly: string) => {
      const [y, m, d] = dateOnly.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 7));
      return next.toISOString().slice(0, 10);
    };
    const { data: newEdition, error } = await supabase
      .from("editions")
      .insert({
        title: `${edition.title} (cópia)`,
        prep_date: addWeekToDateOnly(edition.prep_date),
        order_deadline: addWeek(edition.order_deadline),
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
          starts_at: addWeek(w.starts_at),
          ends_at: addWeek(w.ends_at),
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
    // Os gastos costumam se repetir toda edição (carne, pão, carvão, motoboy...) —
    // copia a descrição e o valor como referência, mas sempre como "previsto":
    // a cópia ainda não foi paga de verdade, isso tem que ser conferido de novo.
    const { data: expensesToCopy } = await supabase
      .from("finance_expenses")
      .select("description, amount_cents")
      .eq("edition_id", edition.id);
    if (expensesToCopy && expensesToCopy.length > 0) {
      await supabase.from("finance_expenses").insert(
        expensesToCopy.map((e) => ({
          edition_id: newEdition.id,
          description: e.description,
          amount_cents: e.amount_cents,
          status: "previsto",
        }))
      );
    }
    router.push(`/admin/edicoes/${newEdition.id}`);
  }

  async function deleteEdition() {
    const ok = await confirmDialog({
      title: `Excluir "${edition.title}"?`,
      message:
        "Isso apaga a edição, seus sabores, janelas e bairros para sempre. Não pode ser desfeito.",
      confirmLabel: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_edition", { p_edition_id: edition.id });
    setDeleting(false);
    if (error) {
      if (error.message.includes("HAS_ORDERS")) {
        await alertDialog({
          title: "Não é possível excluir",
          message:
            "Esta edição já tem pedidos registrados. Para preservar o histórico, edições com pedidos não podem ser apagadas — encerre-a em vez disso.",
          tone: "danger",
        });
      } else {
        await alertDialog({
          title: "Não foi possível excluir",
          message: "Tente novamente em instantes.",
          tone: "danger",
        });
      }
      return;
    }
    router.push("/admin/edicoes");
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href="/admin/edicoes" className="text-sm font-semibold text-coffee-soft">
        ← Voltar às edições
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={edition.title}
          onChange={(e) => setEdition({ ...edition, title: e.target.value })}
          className="min-h-11 w-full rounded-xl bg-white px-2.5 py-2 text-xl font-extrabold text-coffee outline-none focus:ring-2 focus:ring-orange sm:w-auto sm:flex-1 sm:bg-transparent sm:px-2 sm:py-1 sm:focus:bg-white"
        />
        <div className="flex gap-2">
          <button
            onClick={duplicateEdition}
            className="min-h-11 flex-1 rounded-xl bg-cream-soft px-3.5 py-2 text-sm font-bold text-coffee sm:flex-none"
          >
            Duplicar
          </button>
          {edition.status !== "closed" && (
            <button
              onClick={() => setEdition({ ...edition, status: "closed" as EditionStatus })}
              className="min-h-11 flex-1 rounded-xl bg-danger-bg px-3.5 py-2 text-sm font-bold text-danger sm:flex-none"
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
          <Field label="Prazo para abrir as encomendas (opcional)">
            <input
              type="datetime-local"
              value={edition.opens_at ? toLocalInput(edition.opens_at) : ""}
              onChange={(e) =>
                setEdition({
                  ...edition,
                  opens_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="input"
            />
            <p className="mt-1 text-xs text-coffee-soft">
              Deixe em branco para abrir assim que a situação estiver &ldquo;Aberta&rdquo;. Com
              data marcada, as encomendas ficam bloqueadas até essa hora — sem precisar mexer em
              nada na hora certa.
            </p>
          </Field>
          <Field label="Prazo para fechar as encomendas">
            <input
              type="datetime-local"
              value={toLocalInput(edition.order_deadline)}
              onChange={(e) =>
                setEdition({ ...edition, order_deadline: new Date(e.target.value).toISOString() })
              }
              className="input"
            />
            <p className="mt-1 text-xs text-coffee-soft">
              Passado esse horário, as encomendas fecham sozinhas — mesmo que ainda tenha
              estoque. Só volta a abrir se você mudar algo aqui (esse prazo, a situação ou o
              prazo de abertura).
            </p>
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
        freeDelivery={edition.free_delivery}
        onToggleFreeDelivery={(value) => setEdition({ ...edition, free_delivery: value })}
      />

      <section className="mt-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Zona de risco
        </h2>
        <p className="mt-1 text-xs text-coffee-soft">
          Só é possível excluir edições sem nenhum pedido registrado — isso preserva o histórico.
        </p>
        <button
          onClick={deleteEdition}
          disabled={deleting}
          className="mt-3 rounded-xl bg-danger-bg px-4 py-2.5 text-sm font-bold text-danger disabled:opacity-50"
        >
          {deleting ? "Excluindo…" : "Excluir edição"}
        </button>
      </section>

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
          min-height: 44px;
          border-radius: 14px;
          background: var(--color-cream-soft);
          padding: 12px 14px;
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
