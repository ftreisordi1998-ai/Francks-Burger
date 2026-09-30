"use client";

import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import type { Neighborhood } from "@/lib/types";

export function NeighborhoodsManager({
  editionId,
  neighborhoods,
  onChange,
}: {
  editionId: string;
  neighborhoods: Neighborhood[];
  onChange: (neighborhoods: Neighborhood[]) => void;
}) {
  const { confirmDialog, alertDialog } = useDialog();
  async function addNeighborhood() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("neighborhoods")
      .insert({ edition_id: editionId, name: "Novo bairro", delivery_fee_cents: 0 })
      .select("*")
      .single();
    if (!error && data) onChange([...neighborhoods, data as Neighborhood]);
  }

  function updateLocal(id: string, patch: Partial<Neighborhood>) {
    onChange(neighborhoods.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function save(id: string, patch: Partial<Neighborhood>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("neighborhoods")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (!error && data) updateLocal(id, data as Neighborhood);
  }

  async function handleDelete(neighborhood: Neighborhood) {
    const ok = await confirmDialog({
      title: `Excluir "${neighborhood.name}"?`,
      message: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("neighborhoods").delete().eq("id", neighborhood.id);
    if (error) {
      if (error.code === "23503") {
        await alertDialog({
          title: "Não é possível excluir",
          message: `"${neighborhood.name}" já tem pedidos associados. Desative-o (desmarque "Ativo") para tirá-lo das opções sem apagar o histórico.`,
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
    onChange(neighborhoods.filter((n) => n.id !== neighborhood.id));
  }

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Bairros e taxa de entrega
        </h2>
        <button onClick={addNeighborhood} className="text-sm font-bold text-orange">
          + Adicionar bairro
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {neighborhoods.map((n) => (
          <div key={n.id} className="flex items-center gap-2 rounded-xl bg-cream-soft p-3">
            <input
              defaultValue={n.name}
              onBlur={(e) => save(n.id, { name: e.target.value })}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold"
              style={{ fontSize: 16 }}
            />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
              Taxa (R$)
              <input
                type="number"
                step="0.01"
                defaultValue={(n.delivery_fee_cents / 100).toFixed(2)}
                onBlur={(e) =>
                  save(n.id, { delivery_fee_cents: Math.round(Number(e.target.value) * 100) })
                }
                className="w-24 rounded-lg bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
              <input
                type="checkbox"
                checked={n.active}
                onChange={(e) => save(n.id, { active: e.target.checked })}
              />
              Ativo
            </label>
            <button
              onClick={() => handleDelete(n)}
              className="rounded-lg bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger"
            >
              Excluir
            </button>
          </div>
        ))}
        {neighborhoods.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhum bairro cadastrado ainda.</p>
        )}
      </div>
    </section>
  );
}
