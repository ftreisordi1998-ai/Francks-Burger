"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import type {
  CostIngredient,
  CostRecipe,
  CostBurger,
  CostBurgerItem,
  CostBreakdown,
  Product,
} from "@/lib/types";
import { computeMarginMarkup, formatBRL, formatPercent } from "@/lib/cost-calc";
import { ComponentItemsEditor } from "./ComponentItemsEditor";

export function BurgersPanel({
  burgers,
  burgerItems,
  ingredients,
  recipes,
  products,
  onBurgersChange,
  onBurgerItemsChange,
}: {
  burgers: CostBurger[];
  burgerItems: CostBurgerItem[];
  ingredients: CostIngredient[];
  recipes: CostRecipe[];
  products: Product[];
  onBurgersChange: (burgers: CostBurger[]) => void;
  onBurgerItemsChange: (items: CostBurgerItem[]) => void;
}) {
  const { confirmDialog, alertDialog } = useDialog();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<Record<string, CostBreakdown>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadBreakdowns() {
      const supabase = createClient();
      const results = await Promise.all(
        burgers.map((b) =>
          supabase.rpc("burger_cost_breakdown", { p_burger_id: b.id }).then(({ data }) => ({ id: b.id, data })),
        ),
      );
      if (cancelled) return;
      const map: Record<string, CostBreakdown> = {};
      for (const r of results) if (r.data) map[r.id] = r.data as CostBreakdown;
      setBreakdowns(map);
    }
    if (burgers.length > 0) loadBreakdowns();
    return () => {
      cancelled = true;
    };
  }, [burgers, burgerItems]);

  async function addBurger() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_burgers")
      .insert({ name: "Nova ficha", reference_price: 0 })
      .select("*")
      .single();
    if (!error && data) {
      onBurgersChange([...burgers, data as CostBurger]);
      setExpandedId(data.id);
    }
  }

  function updateLocal(id: string, patch: Partial<CostBurger>) {
    onBurgersChange(burgers.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function save(id: string, patch: Partial<CostBurger>) {
    updateLocal(id, patch);
    const supabase = createClient();
    await supabase.from("cost_burgers").update(patch).eq("id", id);
  }

  async function handleDuplicate(burger: CostBurger) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("duplicate_cost_burger", {
      p_burger_id: burger.id,
      p_new_name: `${burger.name} (cópia)`,
    });
    if (error || !data) {
      await alertDialog({ title: "Não foi possível duplicar", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    const [{ data: newBurger }, { data: newItems }] = await Promise.all([
      supabase.from("cost_burgers").select("*").eq("id", data).single(),
      supabase.from("cost_burger_items").select("*").eq("burger_id", data).order("sort_order"),
    ]);
    if (newBurger) onBurgersChange([...burgers, newBurger as CostBurger]);
    if (newItems) onBurgerItemsChange([...burgerItems, ...(newItems as CostBurgerItem[])]);
  }

  async function handleArchive(burger: CostBurger) {
    const ok = await confirmDialog({
      title: `Arquivar "${burger.name}"?`,
      message: "A ficha some da lista ativa, mas o histórico de custo dela continua preservado.",
      confirmLabel: "Arquivar",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("cost_burgers").update({ archived: true }).eq("id", burger.id);
    if (error) {
      await alertDialog({ title: "Não foi possível arquivar", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    onBurgersChange(burgers.filter((b) => b.id !== burger.id));
  }

  const ingredientOptions = ingredients.map((i) => ({ id: i.id, name: i.name }));
  const recipeOptions = recipes.map((r) => ({ id: r.id, name: r.name }));

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Fichas dos burgers
        </h2>
        <button onClick={addBurger} className="text-sm font-bold text-orange">
          + Nova ficha
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {burgers.map((burger) => {
          const breakdown = breakdowns[burger.id];
          const expanded = expandedId === burger.id;
          const cost = breakdown?.complete ? breakdown.direct_cost ?? null : null;
          const { marginPercent, markupPercent } = computeMarginMarkup(cost ?? null, burger.reference_price || null);
          return (
            <div key={burger.id} className="rounded-xl bg-cream-soft p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setExpandedId(expanded ? null : burger.id)}
                  className="text-sm font-bold text-coffee"
                >
                  {expanded ? "▾" : "▸"} {burger.name}
                </button>
                <span className="text-xs text-coffee-soft">Preço ref.: {formatBRL(burger.reference_price)}</span>
                <span className="ml-auto text-right text-xs">
                  {!breakdown || !breakdown.complete ? (
                    <span className="font-bold text-danger">Custo incompleto</span>
                  ) : (
                    <span className="font-bold text-coffee">Custo {formatBRL(cost)}</span>
                  )}
                  {" · "}
                  {!burger.reference_price ? (
                    <span className="font-bold text-danger">Margem indisponível</span>
                  ) : (
                    <span className="font-bold text-coffee">
                      margem {formatPercent(marginPercent)} · markup {formatPercent(markupPercent)}
                    </span>
                  )}
                </span>
                <button onClick={() => handleDuplicate(burger)} className="text-xs font-bold text-orange">
                  Duplicar
                </button>
                <button
                  onClick={() => handleArchive(burger)}
                  className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger"
                >
                  Arquivar
                </button>
              </div>

              {expanded && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      defaultValue={burger.name}
                      onBlur={(e) => save(burger.id, { name: e.target.value })}
                      className="min-h-11 flex-1 min-w-[160px] rounded-lg bg-white px-3 py-2 text-sm font-semibold"
                      style={{ fontSize: 16 }}
                    />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                      Preço de venda (R$)
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={burger.reference_price}
                        onBlur={(e) => save(burger.id, { reference_price: Number(e.target.value) })}
                        className="min-h-11 w-28 rounded-lg bg-white px-2 py-1.5 text-sm"
                        style={{ fontSize: 16 }}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                      Produto vinculado
                      <select
                        defaultValue={burger.linked_product_id ?? ""}
                        onChange={(e) => save(burger.id, { linked_product_id: e.target.value || null })}
                        className="min-h-11 rounded-lg bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Nenhum</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <textarea
                    defaultValue={burger.notes ?? ""}
                    placeholder="Observações da ficha"
                    onBlur={(e) => save(burger.id, { notes: e.target.value || null })}
                    className="min-h-16 rounded-lg bg-white px-3 py-2 text-sm"
                    style={{ fontSize: 16 }}
                  />
                  <ComponentItemsEditor
                    table="cost_burger_items"
                    parentField="burger_id"
                    parentId={burger.id}
                    items={burgerItems.filter((i) => i.burger_id === burger.id)}
                    breakdownItems={breakdown?.items ?? null}
                    ingredientOptions={ingredientOptions}
                    recipeOptions={recipeOptions}
                    onItemsChange={(updated) => {
                      const others = burgerItems.filter((i) => i.burger_id !== burger.id);
                      onBurgerItemsChange([...others, ...updated]);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {burgers.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhuma ficha cadastrada ainda.</p>
        )}
      </div>
    </section>
  );
}
