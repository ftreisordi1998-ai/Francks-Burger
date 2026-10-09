"use client";

import { createClient } from "@/lib/supabase/client";
import type { CostBreakdownItem, RecipeItemComponentType } from "@/lib/types";

interface ItemRow {
  id: string;
  component_type: RecipeItemComponentType;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  qty: number;
  unit: string;
  sort_order: number;
}

export function ComponentItemsEditor<T extends ItemRow>({
  table,
  parentField,
  parentId,
  items,
  breakdownItems,
  ingredientOptions,
  recipeOptions,
  onItemsChange,
}: {
  table: "cost_recipe_items" | "cost_burger_items";
  parentField: "recipe_id" | "burger_id";
  parentId: string;
  items: T[];
  breakdownItems: CostBreakdownItem[] | null;
  ingredientOptions: { id: string; name: string }[];
  recipeOptions: { id: string; name: string }[];
  onItemsChange: (items: T[]) => void;
}) {
  const breakdownById = new Map((breakdownItems ?? []).map((b) => [b.id, b]));

  async function addItem() {
    const supabase = createClient();
    const defaultIngredientId = ingredientOptions[0]?.id ?? null;
    const insertRow: Record<string, unknown> = {
      [parentField]: parentId,
      component_type: "ingredient",
      ingredient_id: defaultIngredientId,
      sub_recipe_id: null,
      qty: 0,
      unit: "g",
      sort_order: items.length,
    };
    const { data, error } = await supabase.from(table).insert(insertRow).select("*").single();
    if (!error && data) onItemsChange([...items, data as T]);
  }

  async function updateItem(id: string, patch: Partial<ItemRow>) {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const supabase = createClient();
    await supabase.from(table).update(patch).eq("id", id);
  }

  async function removeItem(id: string) {
    onItemsChange(items.filter((i) => i.id !== id));
    const supabase = createClient();
    await supabase.from(table).delete().eq("id", id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Ingredientes deste preparo{items.length > 0 && ` (${items.length})`}
        </h3>
        {items.length > 0 && (
          <button onClick={addItem} className="text-sm font-bold text-orange">
            + Adicionar ingrediente
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <button
          onClick={addItem}
          className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-coffee/15 bg-cream-soft px-4 py-7 text-center hover:border-orange/40"
        >
          <span className="text-2xl">🧂</span>
          <span className="text-sm font-bold text-coffee">Nenhum ingrediente adicionado ainda</span>
          <span className="max-w-xs text-xs text-coffee-soft">
            O custo só é calculado com os ingredientes cadastrados aqui — o modo de preparo em
            texto livre, logo acima, não entra na conta.
          </span>
          <span className="mt-1 text-sm font-bold text-orange">+ Adicionar o primeiro ingrediente</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, idx) => {
            const breakdown = breakdownById.get(item.id);
            return (
              <div key={item.id} className="rounded-xl border border-coffee/10 bg-white p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream-soft text-xs font-extrabold text-coffee-soft">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={item.component_type}
                        onChange={(e) => {
                          const type = e.target.value as RecipeItemComponentType;
                          const patch: Partial<ItemRow> =
                            type === "ingredient"
                              ? { component_type: "ingredient", ingredient_id: ingredientOptions[0]?.id ?? null, sub_recipe_id: null }
                              : { component_type: "recipe", sub_recipe_id: recipeOptions[0]?.id ?? null, ingredient_id: null };
                          updateItem(item.id, patch);
                        }}
                        className="min-h-9 shrink-0 rounded-lg bg-cream-soft px-1.5 py-1 text-[11px] font-bold text-coffee-soft"
                      >
                        <option value="ingredient">Insumo</option>
                        <option value="recipe">Preparo</option>
                      </select>
                      {item.component_type === "ingredient" ? (
                        <select
                          value={item.ingredient_id ?? ""}
                          onChange={(e) => updateItem(item.id, { ingredient_id: e.target.value })}
                          className="min-h-9 min-w-[160px] flex-1 rounded-lg border border-coffee/10 bg-white px-2 py-1 text-sm font-bold text-coffee"
                        >
                          {ingredientOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={item.sub_recipe_id ?? ""}
                          onChange={(e) => updateItem(item.id, { sub_recipe_id: e.target.value })}
                          className="min-h-9 min-w-[160px] flex-1 rounded-lg border border-coffee/10 bg-white px-2 py-1 text-sm font-bold text-coffee"
                        >
                          {recipeOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3">
                      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-coffee-soft">
                        Quantidade usada
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.0001"
                            defaultValue={item.qty}
                            onBlur={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                            className="min-h-10 w-24 rounded-lg bg-cream-soft px-2 py-1.5 text-sm font-semibold normal-case text-coffee"
                            style={{ fontSize: 16 }}
                          />
                          <input
                            defaultValue={item.unit}
                            onBlur={(e) => updateItem(item.id, { unit: e.target.value })}
                            className="min-h-10 w-20 rounded-lg bg-cream-soft px-2 py-1.5 text-sm font-semibold normal-case text-coffee"
                            style={{ fontSize: 16 }}
                            placeholder="g, ml, unid."
                          />
                        </div>
                      </label>

                      <div className="text-right">
                        {!breakdown || !breakdown.complete ? (
                          <>
                            <span className="text-sm font-bold text-danger">Custo incompleto</span>
                            {breakdown?.incomplete_reason && (
                              <p className="max-w-[180px] text-[11px] text-danger/80">
                                {breakdown.incomplete_reason}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-extrabold text-coffee">
                              {breakdown.line_cost?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                            {breakdown.unit_cost != null && (
                              <p className="text-[11px] text-coffee-soft">
                                {item.qty} {item.unit} × {breakdown.unit_cost.toLocaleString("pt-BR", { maximumFractionDigits: 5 })}/{item.unit}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Remover ingrediente"
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-danger hover:bg-danger-bg"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={addItem} className="self-start text-sm font-bold text-orange">
            + Adicionar outro ingrediente
          </button>
        </div>
      )}
    </div>
  );
}
