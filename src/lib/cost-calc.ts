import type { CostFee } from "./types";

/** Margem = quanto do preço de venda é sobra. Markup = quanto se soma sobre o
 * custo para chegar no preço. São conceitos diferentes e nunca devem ser
 * confundidos na exibição. Preço de venda zero/ausente => margem indisponível. */
export function computeMarginMarkup(
  cost: number | null,
  price: number | null
): { marginPercent: number | null; markupPercent: number | null } {
  if (cost == null || price == null || price <= 0) {
    return { marginPercent: null, markupPercent: null };
  }
  const profit = price - cost;
  return {
    marginPercent: (profit / price) * 100,
    markupPercent: cost > 0 ? (profit / cost) * 100 : null,
  };
}

/** Preço sugerido para atingir uma margem-alvo, sem considerar taxa de venda. */
export function suggestedPriceWithoutFee(
  cost: number,
  targetMarginPercent: number
): number | null {
  const m = targetMarginPercent / 100;
  if (m >= 1) return null;
  return cost / (1 - m);
}

/** Preço sugerido para atingir uma margem-alvo já absorvendo uma taxa de venda
 * (percentual sobre o preço, ou um valor fixo por unidade vendida). */
export function suggestedPriceWithFee(
  cost: number,
  targetMarginPercent: number,
  fee: Pick<CostFee, "fee_type" | "value"> | null
): number | null {
  const m = targetMarginPercent / 100;
  if (!fee) return suggestedPriceWithoutFee(cost, targetMarginPercent);
  if (fee.fee_type === "percentual") {
    const f = fee.value / 100;
    if (m + f >= 1) return null;
    return cost / (1 - m - f);
  }
  if (m >= 1) return null;
  return (cost + fee.value) / (1 - m);
}

export interface ProductionSimulationInput {
  unitCost: number | null;
  producedQty: number;
  soldQty: number;
  salePrice: number | null;
  fee: Pick<CostFee, "fee_type" | "value"> | null;
}

export interface ProductionSimulationResult {
  totalCost: number | null;
  revenue: number | null;
  feeAmount: number | null;
  netRevenue: number | null;
  /** Sobra do período (receita líquida - custo total). Nunca chamar de
   * "lucro líquido": não contempla despesas fixas nem rateio de produção. */
  sobra: number | null;
  unsoldQty: number;
}

export function computeProductionSimulation(
  input: ProductionSimulationInput
): ProductionSimulationResult {
  const { unitCost, producedQty, soldQty, salePrice, fee } = input;
  const totalCost = unitCost != null ? unitCost * producedQty : null;
  const revenue = salePrice != null ? salePrice * soldQty : null;
  let feeAmount: number | null = null;
  if (revenue != null && fee) {
    feeAmount = fee.fee_type === "percentual" ? revenue * (fee.value / 100) : fee.value * soldQty;
  }
  const netRevenue = revenue != null ? revenue - (feeAmount ?? 0) : null;
  const sobra = totalCost != null && netRevenue != null ? netRevenue - totalCost : null;
  return { totalCost, revenue, feeAmount, netRevenue, sobra, unsoldQty: producedQty - soldQty };
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export const PRICE_STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  aproximado: "Aproximado",
  estimado: "Estimado",
  pendente: "Pendente",
};
