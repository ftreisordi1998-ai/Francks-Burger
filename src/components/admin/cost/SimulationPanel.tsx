"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  CostBurger,
  CostFee,
  CostFixedExpense,
  CostProductionExpense,
  CostSimulation,
  CostBreakdown,
} from "@/lib/types";
import {
  computeMarginMarkup,
  computeProductionSimulation,
  suggestedPriceWithFee,
  suggestedPriceWithoutFee,
  formatBRL,
  formatPercent,
} from "@/lib/cost-calc";

export function SimulationPanel({
  burgers,
  fees,
  productionExpenses,
  fixedExpenses,
  simulations,
  onProductionExpensesChange,
  onFixedExpensesChange,
  onFeesChange,
  onSimulationsChange,
}: {
  burgers: CostBurger[];
  fees: CostFee[];
  productionExpenses: CostProductionExpense[];
  fixedExpenses: CostFixedExpense[];
  simulations: CostSimulation[];
  onProductionExpensesChange: (v: CostProductionExpense[]) => void;
  onFixedExpensesChange: (v: CostFixedExpense[]) => void;
  onFeesChange: (v: CostFee[]) => void;
  onSimulationsChange: (v: CostSimulation[]) => void;
}) {
  const [burgerId, setBurgerId] = useState(burgers[0]?.id ?? "");
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [includeRateio, setIncludeRateio] = useState(true);
  const [producedQty, setProducedQty] = useState(10);
  const [soldQty, setSoldQty] = useState(10);
  const [salePrice, setSalePrice] = useState<number | null>(null);
  const [feeId, setFeeId] = useState<string>("");
  const [targetMargin, setTargetMargin] = useState(50);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!burgerId) {
        setBreakdown(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.rpc("burger_cost_breakdown", { p_burger_id: burgerId });
      if (!cancelled) setBreakdown((data as CostBreakdown) ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [burgerId]);

  useEffect(() => {
    const burger = burgers.find((b) => b.id === burgerId);
    setSalePrice(burger?.reference_price ?? null);
  }, [burgerId, burgers]);

  const rateioPerUnit = useMemo(
    () => productionExpenses.reduce((sum, e) => sum + (e.planned_qty > 0 ? e.amount / e.planned_qty : 0), 0),
    [productionExpenses],
  );

  const directCost = breakdown?.complete ? breakdown.direct_cost ?? null : null;
  const unitCost = directCost != null ? directCost + (includeRateio ? rateioPerUnit : 0) : null;
  const selectedFee = fees.find((f) => f.id === feeId) ?? null;

  const { marginPercent, markupPercent } = computeMarginMarkup(unitCost, salePrice);
  const simResult = computeProductionSimulation({
    unitCost,
    producedQty,
    soldQty,
    salePrice,
    fee: selectedFee,
  });
  const suggestedNoFee = unitCost != null ? suggestedPriceWithoutFee(unitCost, targetMargin) : null;
  const suggestedWithFee = unitCost != null ? suggestedPriceWithFee(unitCost, targetMargin, selectedFee) : null;

  async function saveSnapshot() {
    const burger = burgers.find((b) => b.id === burgerId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_simulations")
      .insert({
        name: `${burger?.name ?? "Simulação"} — ${new Date().toLocaleDateString("pt-BR")}`,
        snapshot: {
          burgerId,
          burgerName: burger?.name ?? "",
          unitCost,
          costComplete: unitCost != null,
          producedQty,
          soldQty,
          salePrice,
          feeId: feeId || null,
          feeLabel: selectedFee?.name ?? null,
          targetMarginPercent: targetMargin,
          suggestedPriceWithFee: suggestedWithFee,
          suggestedPriceWithoutFee: suggestedNoFee,
        },
      })
      .select("*")
      .single();
    if (!error && data) onSimulationsChange([data as CostSimulation, ...simulations]);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Simulação de preço e produção
        </h2>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Burger
            <select
              value={burgerId}
              onChange={(e) => setBurgerId(e.target.value)}
              className="min-h-11 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
            >
              {burgers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Produzidos
            <input
              type="number"
              value={producedQty}
              onChange={(e) => setProducedQty(Number(e.target.value))}
              className="min-h-11 w-20 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Vendidos
            <input
              type="number"
              value={soldQty}
              onChange={(e) => setSoldQty(Number(e.target.value))}
              className="min-h-11 w-20 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Preço de venda (R$)
            <input
              type="number"
              step="0.01"
              value={salePrice ?? ""}
              onChange={(e) => setSalePrice(e.target.value === "" ? null : Number(e.target.value))}
              className="min-h-11 w-24 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Taxa de venda
            <select
              value={feeId}
              onChange={(e) => setFeeId(e.target.value)}
              className="min-h-11 rounded-lg bg-cream-soft px-2 py-1.5 text-sm"
            >
              <option value="">Nenhuma</option>
              {fees.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.fee_type === "percentual" ? `${f.value}%` : formatBRL(f.value)})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            <input type="checkbox" checked={includeRateio} onChange={(e) => setIncludeRateio(e.target.checked)} />
            Incluir rateio de produção ({formatBRL(rateioPerUnit)}/unid.)
          </label>
        </div>

        <div className="rounded-xl bg-cream-soft p-3 text-sm">
          {unitCost == null ? (
            <p className="font-bold text-danger">Custo incompleto — alguns insumos desta ficha ainda não têm preço completo.</p>
          ) : (
            <p className="font-bold text-coffee">
              Custo por unidade: {formatBRL(unitCost)}
              {includeRateio && ` (inclui ${formatBRL(rateioPerUnit)} de rateio de produção)`}
            </p>
          )}
          {!salePrice ? (
            <p className="font-bold text-danger">Margem indisponível — informe um preço de venda maior que zero.</p>
          ) : (
            <p className="text-coffee-soft">
              Margem: <span className="font-bold text-coffee">{formatPercent(marginPercent)}</span> · Markup:{" "}
              <span className="font-bold text-coffee">{formatPercent(markupPercent)}</span>
            </p>
          )}
        </div>

        <div className="rounded-xl bg-cream-soft p-3 text-sm">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Produzido × vendido
          </p>
          <p className="text-coffee-soft">
            Custo total de produção: <span className="font-bold text-coffee">{formatBRL(simResult.totalCost)}</span>
          </p>
          <p className="text-coffee-soft">
            Receita bruta: <span className="font-bold text-coffee">{formatBRL(simResult.revenue)}</span>
            {simResult.feeAmount != null && (
              <> · taxa: <span className="font-bold text-coffee">{formatBRL(simResult.feeAmount)}</span></>
            )}
          </p>
          <p className="text-coffee-soft">
            Sobra do período (receita líquida − custo de produção):{" "}
            <span className="font-bold text-coffee">{formatBRL(simResult.sobra)}</span>
          </p>
          <p className="text-xs text-coffee-soft">
            Não é lucro líquido: não considera despesas fixas mensais. {simResult.unsoldQty > 0 && `${simResult.unsoldQty} unidade(s) produzida(s) não vendida(s).`}
          </p>
        </div>

        <div className="rounded-xl bg-cream-soft p-3 text-sm">
          <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Margem-alvo para sugestão de preço
            <input
              type="number"
              value={targetMargin}
              onChange={(e) => setTargetMargin(Number(e.target.value))}
              className="min-h-11 w-20 rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            %
          </label>
          <p className="text-coffee-soft">
            Preço sugerido sem taxa: <span className="font-bold text-coffee">{formatBRL(suggestedNoFee)}</span>
          </p>
          <p className="text-coffee-soft">
            Preço sugerido com taxa selecionada: <span className="font-bold text-coffee">{formatBRL(suggestedWithFee)}</span>
          </p>
        </div>

        <button
          onClick={saveSnapshot}
          disabled={!burgerId}
          className="self-start rounded-xl bg-orange px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Salvar simulação
        </button>
      </section>

      <ExpensesPanel
        productionExpenses={productionExpenses}
        fixedExpenses={fixedExpenses}
        fees={fees}
        onProductionExpensesChange={onProductionExpensesChange}
        onFixedExpensesChange={onFixedExpensesChange}
        onFeesChange={onFeesChange}
      />

      {simulations.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Simulações salvas
          </h2>
          {simulations.map((s) => (
            <div key={s.id} className="rounded-lg bg-cream-soft p-2.5 text-sm">
              <span className="font-bold text-coffee">{s.name}</span>
              <span className="ml-2 text-coffee-soft">
                {s.snapshot.costComplete ? formatBRL(s.snapshot.unitCost) : "custo incompleto"} ·{" "}
                {s.snapshot.producedQty} produzidos / {s.snapshot.soldQty} vendidos
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ExpensesPanel({
  productionExpenses,
  fixedExpenses,
  fees,
  onProductionExpensesChange,
  onFixedExpensesChange,
  onFeesChange,
}: {
  productionExpenses: CostProductionExpense[];
  fixedExpenses: CostFixedExpense[];
  fees: CostFee[];
  onProductionExpensesChange: (v: CostProductionExpense[]) => void;
  onFixedExpensesChange: (v: CostFixedExpense[]) => void;
  onFeesChange: (v: CostFee[]) => void;
}) {
  async function addProductionExpense() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_production_expenses")
      .insert({ name: "Nova despesa de produção", amount: 0, planned_qty: 1 })
      .select("*")
      .single();
    if (!error && data) onProductionExpensesChange([...productionExpenses, data as CostProductionExpense]);
  }

  async function saveProductionExpense(id: string, patch: Partial<CostProductionExpense>) {
    onProductionExpensesChange(productionExpenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const supabase = createClient();
    await supabase.from("cost_production_expenses").update(patch).eq("id", id);
  }

  async function removeProductionExpense(id: string) {
    onProductionExpensesChange(productionExpenses.filter((e) => e.id !== id));
    const supabase = createClient();
    await supabase.from("cost_production_expenses").update({ archived: true }).eq("id", id);
  }

  async function addFixedExpense() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_fixed_expenses")
      .insert({ name: "Nova despesa fixa", amount: 0 })
      .select("*")
      .single();
    if (!error && data) onFixedExpensesChange([...fixedExpenses, data as CostFixedExpense]);
  }

  async function saveFixedExpense(id: string, patch: Partial<CostFixedExpense>) {
    onFixedExpensesChange(fixedExpenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const supabase = createClient();
    await supabase.from("cost_fixed_expenses").update(patch).eq("id", id);
  }

  async function removeFixedExpense(id: string) {
    onFixedExpensesChange(fixedExpenses.filter((e) => e.id !== id));
    const supabase = createClient();
    await supabase.from("cost_fixed_expenses").update({ archived: true }).eq("id", id);
  }

  async function addFee() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cost_fees")
      .insert({ name: "Nova taxa", fee_type: "percentual", value: 0 })
      .select("*")
      .single();
    if (!error && data) onFeesChange([...fees, data as CostFee]);
  }

  async function saveFee(id: string, patch: Partial<CostFee>) {
    onFeesChange(fees.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const supabase = createClient();
    await supabase.from("cost_fees").update(patch).eq("id", id);
  }

  async function removeFee(id: string) {
    onFeesChange(fees.filter((f) => f.id !== id));
    const supabase = createClient();
    await supabase.from("cost_fees").update({ archived: true }).eq("id", id);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
      <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
        Despesas e taxas (só contam quando cadastradas aqui)
      </h2>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-coffee">Rateio de produção (ex: carvão)</p>
          <button onClick={addProductionExpense} className="text-sm font-bold text-orange">
            + Adicionar
          </button>
        </div>
        {productionExpenses.map((e) => (
          <div key={e.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-cream-soft p-2">
            <input
              defaultValue={e.name}
              onBlur={(ev) => saveProductionExpense(e.id, { name: ev.target.value })}
              className="min-h-11 flex-1 min-w-[140px] rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <label className="flex items-center gap-1 text-xs text-coffee-soft">
              R$
              <input
                type="number"
                step="0.01"
                defaultValue={e.amount}
                onBlur={(ev) => saveProductionExpense(e.id, { amount: Number(ev.target.value) })}
                className="min-h-11 w-20 rounded-lg bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-coffee-soft">
              ÷
              <input
                type="number"
                defaultValue={e.planned_qty}
                onBlur={(ev) => saveProductionExpense(e.id, { planned_qty: Number(ev.target.value) })}
                className="min-h-11 w-20 rounded-lg bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
              unid.
            </label>
            <button onClick={() => removeProductionExpense(e.id)} className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger">
              Remover
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-coffee">Despesas fixas mensais (informativo)</p>
          <button onClick={addFixedExpense} className="text-sm font-bold text-orange">
            + Adicionar
          </button>
        </div>
        {fixedExpenses.map((e) => (
          <div key={e.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-cream-soft p-2">
            <input
              defaultValue={e.name}
              onBlur={(ev) => saveFixedExpense(e.id, { name: ev.target.value })}
              className="min-h-11 flex-1 min-w-[140px] rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <label className="flex items-center gap-1 text-xs text-coffee-soft">
              R$/mês
              <input
                type="number"
                step="0.01"
                defaultValue={e.amount}
                onBlur={(ev) => saveFixedExpense(e.id, { amount: Number(ev.target.value) })}
                className="min-h-11 w-24 rounded-lg bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
            </label>
            <button onClick={() => removeFixedExpense(e.id)} className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger">
              Remover
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-coffee">Taxas de venda</p>
          <button onClick={addFee} className="text-sm font-bold text-orange">
            + Adicionar
          </button>
        </div>
        {fees.map((f) => (
          <div key={f.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-cream-soft p-2">
            <input
              defaultValue={f.name}
              onBlur={(ev) => saveFee(f.id, { name: ev.target.value })}
              className="min-h-11 flex-1 min-w-[140px] rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <select
              defaultValue={f.fee_type}
              onChange={(ev) => saveFee(f.id, { fee_type: ev.target.value as "percentual" | "fixo" })}
              className="min-h-11 rounded-lg bg-white px-2 py-1.5 text-sm"
            >
              <option value="percentual">% sobre o preço</option>
              <option value="fixo">R$ fixo por unidade</option>
            </select>
            <input
              type="number"
              step="0.01"
              defaultValue={f.value}
              onBlur={(ev) => saveFee(f.id, { value: Number(ev.target.value) })}
              className="min-h-11 w-20 rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
            <button onClick={() => removeFee(f.id)} className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger">
              Remover
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
