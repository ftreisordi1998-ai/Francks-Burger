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
    <div className="flex flex-col gap-2">
      <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-bold text-coffee-soft sm:grid">
        <span>Item</span>
        <span>Qtd.</span>
        <span>Unidade</span>
        <span>Custo no item</span>
        <span />
      </div>
      {items.map((item) => {
        const breakdown = breakdownById.get(item.id);
        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg bg-white p-2 sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center"
          >
            <div className="flex gap-1.5">
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
                className="min-h-11 rounded-lg bg-cream-soft px-1.5 py-1.5 text-xs font-bold"
              >
                <option value="ingredient">Insumo</option>
                <option value="recipe">Preparo</option>
              </select>
              {item.component_type === "ingredient" ? (
                <select
                  value={item.ingredient_id ?? ""}
                  onChange={(e) => updateItem(item.id, { ingredient_id: e.target.value })}
                  className="min-h-11 flex-1 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
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
                  className="min-h-11 flex-1 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
                >
                  {recipeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              type="number"
              step="0.0001"
              defaultValue={item.qty}
              onBlur={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
              className="min-h-11 w-20 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <input
              defaultValue={item.unit}
              onBlur={(e) => updateItem(item.id, { unit: e.target.value })}
              className="min-h-11 w-20 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <span className="text-xs font-bold">
              {!breakdown || !breakdown.complete ? (
                <span className="text-danger" title={breakdown?.incomplete_reason ?? undefined}>
                  Custo incompleto
                  {breakdown?.incomplete_reason && (
                    <span className="block font-normal text-[11px] text-danger/80">
                      {breakdown.incomplete_reason}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-coffee">
                  {breakdown.line_cost?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  {breakdown.unit_cost != null && (
                    <span className="block font-normal text-[11px] text-coffee-soft">
                      {item.qty} {item.unit} × {breakdown.unit_cost.toLocaleString("pt-BR", { maximumFractionDigits: 5 })}/{item.unit}
                    </span>
                  )}
                </span>
              )}
            </span>
            <button
              onClick={() => removeItem(item.id)}
              className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger"
            >
              Remover
            </button>
          </div>
        );
      })}
      <button onClick={addItem} className="self-start text-sm font-bold text-orange">
        + Adicionar item
      </button>
    </div>
  );
}
