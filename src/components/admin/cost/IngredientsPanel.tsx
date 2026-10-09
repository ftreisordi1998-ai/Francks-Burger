"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import type { CostIngredient, PriceStatus, PurchaseUnit } from "@/lib/types";
import { PRICE_STATUS_LABEL } from "@/lib/cost-calc";

const PURCHASE_UNITS: PurchaseUnit[] = ["kg", "g", "l", "ml", "unidade"];
const PRICE_STATUSES: PriceStatus[] = ["confirmado", "aproximado", "estimado", "pendente"];

const STATUS_BADGE: Record<PriceStatus, string> = {
  confirmado: "bg-success-bg text-success",
  aproximado: "bg-warning-bg text-warning",
  estimado: "bg-warning-bg text-warning",
  pendente: "bg-danger-bg text-danger",
};

type UnitCostInfo = { unit_cost: number | null; base_unit: string; is_complete: boolean };

export function IngredientsPanel({
  ingredients,
  onChange,
}: {
  ingredients: CostIngredient[];
  onChange: (ingredients: CostIngredient[]) => void;
}) {
  const { confirmDialog, alertDialog } = useDialog();
  const [unitCosts, setUnitCosts] = useState<Record<string, UnitCostInfo>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadCosts() {
      const supabase = createClient();
      const results = await Promise.all(
        ingredients.map((ing) =>
          supabase.rpc("ingredient_unit_cost", { p_ingredient_id: ing.id }).then(({ data }) => ({
            id: ing.id,
            info: data?.[0] as UnitCostInfo | undefined,
          }))
        )
      );
      if (cancelled) return;
      const map: Record<string, UnitCostInfo> = {};
      for (const r of results) {
        if (r.info) map[r.id] = r.info;
      }
      setUnitCosts(map);
    }
    if (ingredients.length > 0) loadCosts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients.map((i) => `${i.id}:${i.purchase_price}:${i.purchase_qty}:${i.purchase_unit}:${i.yield_qty}:${i.yield_unit}`).join(",")]);

  async function addIngredient() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_ingredients")
      .insert({ name: "Novo insumo", purchase_price: 0, purchase_qty: 1, purchase_unit: "unidade" })
      .select("*")
      .single();
    if (!error && data) onChange([...ingredients, data as CostIngredient]);
  }

  function updateLocal(id: string, patch: Partial<CostIngredient>) {
    onChange(ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function save(id: string, patch: Partial<CostIngredient>) {
    updateLocal(id, patch);
    const supabase = createClient();
    await supabase.from("cost_ingredients").update(patch).eq("id", id);
  }

  async function handleArchive(ing: CostIngredient) {
    const ok = await confirmDialog({
      title: `Arquivar "${ing.name}"?`,
      message:
        "O insumo some das opções para novas receitas e fichas, mas continua valendo para o histórico de quem já usa ele.",
      confirmLabel: "Arquivar",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("cost_ingredients").update({ archived: true }).eq("id", ing.id);
    if (error) {
      await alertDialog({ title: "Não foi possível arquivar", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    onChange(ingredients.filter((i) => i.id !== ing.id));
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Insumos
        </h2>
        <button onClick={addIngredient} className="text-sm font-bold text-orange">
          + Adicionar insumo
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {ingredients.map((ing) => {
          const uc = unitCosts[ing.id];
          const isYield = ing.yield_qty != null;
          return (
            <div key={ing.id} className="flex flex-col gap-2 rounded-xl bg-cream-soft p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={ing.name}
                  onBlur={(e) => save(ing.id, { name: e.target.value })}
                  className="min-h-11 flex-1 min-w-[160px] rounded-lg bg-white px-3 py-2 text-sm font-semibold"
                  style={{ fontSize: 16 }}
                />
                <select
                  defaultValue={ing.price_status}
                  onChange={(e) => save(ing.id, { price_status: e.target.value as PriceStatus })}
                  className="min-h-11 rounded-lg bg-white px-2 py-1.5 text-xs font-bold"
                >
                  {PRICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PRICE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[ing.price_status]}`}>
                  {PRICE_STATUS_LABEL[ing.price_status]}
                </span>
                <button
                  onClick={() => handleArchive(ing)}
                  className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger"
                >
                  Arquivar
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                  Preço (R$)
                  <input
                    type="number"
                    step="0.0001"
                    defaultValue={ing.purchase_price}
                    onBlur={(e) => save(ing.id, { purchase_price: Number(e.target.value) })}
                    className="min-h-11 w-24 rounded-lg bg-white px-2 py-1.5 text-sm"
                    style={{ fontSize: 16 }}
                  />
                </label>

                {!isYield && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                    Qtd. comprada
                    <input
                      type="number"
                      step="0.0001"
                      defaultValue={ing.purchase_qty ?? ""}
                      placeholder="?"
                      onBlur={(e) =>
                        save(ing.id, { purchase_qty: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      className="min-h-11 w-24 rounded-lg bg-white px-2 py-1.5 text-sm"
                      style={{ fontSize: 16 }}
                    />
                  </label>
                )}

                <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                  Unidade de compra
                  <select
                    defaultValue={ing.purchase_unit}
                    onChange={(e) => save(ing.id, { purchase_unit: e.target.value as PurchaseUnit })}
                    className="min-h-11 rounded-lg bg-white px-2 py-1.5 text-sm"
                  >
                    {PURCHASE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                  Rendimento (porções)
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={ing.yield_qty ?? ""}
                    placeholder="sem rendimento"
                    onBlur={(e) =>
                      save(ing.id, {
                        yield_qty: e.target.value === "" ? null : Number(e.target.value),
                        yield_unit: e.target.value === "" ? null : ing.yield_unit ?? "porção",
                      })
                    }
                    className="min-h-11 w-28 rounded-lg bg-white px-2 py-1.5 text-sm"
                    style={{ fontSize: 16 }}
                  />
                </label>

                {isYield && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
                    <input
                      type="checkbox"
                      checked={ing.yield_is_estimated}
                      onChange={(e) => save(ing.id, { yield_is_estimated: e.target.checked })}
                    />
                    Rendimento estimado
                  </label>
                )}

                <div className="ml-auto text-right text-xs">
                  {!uc || !uc.is_complete ? (
                    <span className="font-bold text-danger">Custo incompleto</span>
                  ) : (
                    <span className="font-bold text-coffee">
                      {uc.unit_cost?.toLocaleString("pt-BR", { maximumFractionDigits: 5 })} / {uc.base_unit}
                    </span>
                  )}
                </div>
              </div>

              <textarea
                defaultValue={ing.notes ?? ""}
                onBlur={(e) => save(ing.id, { notes: e.target.value || null })}
                placeholder="Observações (ex: estimativa provisória, volume ainda não confirmado...)"
                className="min-h-16 rounded-lg bg-white px-3 py-2 text-xs"
                style={{ fontSize: 16 }}
              />
            </div>
          );
        })}
        {ingredients.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhum insumo cadastrado ainda.</p>
        )}
      </div>
    </section>
  );
}
