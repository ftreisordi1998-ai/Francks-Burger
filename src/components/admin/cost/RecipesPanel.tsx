"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import type { CostIngredient, CostRecipe, CostRecipeItem, CostBreakdown } from "@/lib/types";
import { formatBRL } from "@/lib/cost-calc";
import { ComponentItemsEditor } from "./ComponentItemsEditor";

export function RecipesPanel({
  recipes,
  recipeItems,
  ingredients,
  onRecipesChange,
  onRecipeItemsChange,
}: {
  recipes: CostRecipe[];
  recipeItems: CostRecipeItem[];
  ingredients: CostIngredient[];
  onRecipesChange: (recipes: CostRecipe[]) => void;
  onRecipeItemsChange: (items: CostRecipeItem[]) => void;
}) {
  const { confirmDialog, alertDialog } = useDialog();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<Record<string, CostBreakdown>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadBreakdowns() {
      const supabase = createClient();
      const results = await Promise.all(
        recipes.map((r) =>
          supabase.rpc("recipe_cost_breakdown", { p_recipe_id: r.id }).then(({ data }) => ({ id: r.id, data })),
        ),
      );
      if (cancelled) return;
      const map: Record<string, CostBreakdown> = {};
      for (const r of results) if (r.data) map[r.id] = r.data as CostBreakdown;
      setBreakdowns(map);
    }
    if (recipes.length > 0) loadBreakdowns();
    return () => {
      cancelled = true;
    };
  }, [recipes, recipeItems]);

  async function addRecipe() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_recipes")
      .insert({ name: "Nova receita", yield_qty: 1000, yield_unit: "g" })
      .select("*")
      .single();
    if (!error && data) {
      onRecipesChange([...recipes, data as CostRecipe]);
      setExpandedId(data.id);
    }
  }

  function updateLocal(id: string, patch: Partial<CostRecipe>) {
    onRecipesChange(recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(id: string, patch: Partial<CostRecipe>) {
    updateLocal(id, patch);
    const supabase = createClient();
    await supabase.from("cost_recipes").update(patch).eq("id", id);
  }

  async function handleDuplicate(recipe: CostRecipe) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("duplicate_cost_recipe", {
      p_recipe_id: recipe.id,
      p_new_name: `${recipe.name} (cópia)`,
    });
    if (error || !data) {
      await alertDialog({ title: "Não foi possível duplicar", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    const [{ data: newRecipe }, { data: newItems }] = await Promise.all([
      supabase.from("cost_recipes").select("*").eq("id", data).single(),
      supabase.from("cost_recipe_items").select("*").eq("recipe_id", data).order("sort_order"),
    ]);
    if (newRecipe) onRecipesChange([...recipes, newRecipe as CostRecipe]);
    if (newItems) onRecipeItemsChange([...recipeItems, ...(newItems as CostRecipeItem[])]);
  }

  async function handleArchive(recipe: CostRecipe) {
    const ok = await confirmDialog({
      title: `Arquivar "${recipe.name}"?`,
      message: "A receita some das opções para novos preparos e fichas, mas continua valendo para quem já usa ela.",
      confirmLabel: "Arquivar",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("cost_recipes").update({ archived: true }).eq("id", recipe.id);
    if (error) {
      await alertDialog({ title: "Não foi possível arquivar", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    onRecipesChange(recipes.filter((r) => r.id !== recipe.id));
  }

  const ingredientOptions = ingredients.map((i) => ({ id: i.id, name: i.name }));

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Minhas receitas (preparos)
        </h2>
        <button onClick={addRecipe} className="text-sm font-bold text-orange">
          + Nova receita
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {recipes.map((recipe) => {
          const breakdown = breakdowns[recipe.id];
          const expanded = expandedId === recipe.id;
          const recipeOptionsForThis = recipes
            .filter((r) => r.id !== recipe.id)
            .map((r) => ({ id: r.id, name: r.name }));
          return (
            <div key={recipe.id} className="rounded-xl bg-cream-soft p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setExpandedId(expanded ? null : recipe.id)}
                  className="text-sm font-bold text-coffee"
                >
                  {expanded ? "▾" : "▸"} {recipe.name}
                </button>
                <span className="text-xs text-coffee-soft">
                  {recipe.yield_qty != null ? `rende ${recipe.yield_qty} ${recipe.yield_unit}` : "sem rendimento definido"}
                </span>
                <span className="ml-auto text-sm font-bold">
                  {!breakdown || !breakdown.complete ? (
                    <span className="text-danger">
                      Custo incompleto
                      {breakdown && (
                        <span className="block text-xs font-normal text-coffee-soft">
                          {breakdown.incomplete_reason ?? "Subtotal dos itens calculáveis"}:{" "}
                          {formatBRL(breakdown.total_cost)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <>
                      {formatBRL(breakdown.total_cost)} total ·{" "}
                      {formatBRL(breakdown.cost_per_yield_unit)}/{breakdown.yield_unit}
                    </>
                  )}
                </span>
                <button onClick={() => handleDuplicate(recipe)} className="text-xs font-bold text-orange">
                  Duplicar
                </button>
                <button
                  onClick={() => handleArchive(recipe)}
                  className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger"
                >
                  Arquivar
                </button>
              </div>

              {expanded && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      defaultValue={recipe.name}
                      onBlur={(e) => save(recipe.id, { name: e.target.value })}
                      className="min-h-11 flex-1 min-w-[160px] rounded-lg bg-white px-3 py-2 text-sm font-semibold"
                      style={{ fontSize: 16 }}
                    />
                    <input
                      defaultValue={recipe.category ?? ""}
                      placeholder="Categoria"
                      onBlur={(e) => save(recipe.id, { category: e.target.value || null })}
                      className="min-h-11 w-40 rounded-lg bg-white px-3 py-2 text-sm"
                      style={{ fontSize: 16 }}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      defaultValue={recipe.yield_qty ?? ""}
                      placeholder="Rendimento"
                      onBlur={(e) => save(recipe.id, { yield_qty: e.target.value === "" ? null : Number(e.target.value) })}
                      className="min-h-11 w-28 rounded-lg bg-white px-2 py-1.5 text-sm"
                      style={{ fontSize: 16 }}
                    />
                    <input
                      defaultValue={recipe.yield_unit ?? ""}
                      placeholder="Unidade"
                      onBlur={(e) => save(recipe.id, { yield_unit: e.target.value || null })}
                      className="min-h-11 w-24 rounded-lg bg-white px-2 py-1.5 text-sm"
                      style={{ fontSize: 16 }}
                    />
                  </div>
                  <YieldMismatchWarning
                    recipe={recipe}
                    items={recipeItems.filter((i) => i.recipe_id === recipe.id)}
                    onFix={(sum) => save(recipe.id, { yield_qty: sum })}
                  />
                  <textarea
                    defaultValue={recipe.instructions ?? ""}
                    placeholder="Modo de preparo"
                    onBlur={(e) => save(recipe.id, { instructions: e.target.value || null })}
                    className="min-h-16 rounded-lg bg-white px-3 py-2 text-sm"
                    style={{ fontSize: 16 }}
                  />
                  <ComponentItemsEditor
                    table="cost_recipe_items"
                    parentField="recipe_id"
                    parentId={recipe.id}
                    items={recipeItems.filter((i) => i.recipe_id === recipe.id)}
                    breakdownItems={breakdown?.items ?? null}
                    ingredientOptions={ingredientOptions}
                    recipeOptions={recipeOptionsForThis}
                    onItemsChange={(updated) => {
                      const others = recipeItems.filter((i) => i.recipe_id !== recipe.id);
                      onRecipeItemsChange([...others, ...updated]);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {recipes.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhuma receita cadastrada ainda.</p>
        )}
      </div>
    </section>
  );
}

/** Soma só os itens cujo unidade bate exatamente com a unidade de
 * rendimento da receita (ex: todos em "g") — conversão kg/g e l/ml fica a
 * cargo do cálculo no banco; aqui é só um alerta para o cadastro não ficar
 * com o rendimento desatualizado depois de editar as quantidades. */
function YieldMismatchWarning({
  recipe,
  items,
  onFix,
}: {
  recipe: CostRecipe;
  items: CostRecipeItem[];
  onFix: (sum: number) => void;
}) {
  if (!recipe.yield_unit || recipe.yield_qty == null) return null;
  const matching = items.filter((i) => i.unit === recipe.yield_unit);
  if (matching.length !== items.length || items.length === 0) return null;
  const sum = matching.reduce((acc, i) => acc + i.qty, 0);
  if (Math.abs(sum - recipe.yield_qty) < 0.001) return null;
  return (
    <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
      Os itens somam {sum} {recipe.yield_unit}, mas o rendimento cadastrado é {recipe.yield_qty}{" "}
      {recipe.yield_unit}. Isso distorce o custo por {recipe.yield_unit} desta receita.{" "}
      <button onClick={() => onFix(sum)} className="underline">
        Usar {sum} {recipe.yield_unit} como rendimento
      </button>
    </p>
  );
}
