import type { Edition, Product } from "./types";

export type EditionSituation =
  | "open"
  | "scheduled"
  | "deadline_passed"
  | "sold_out"
  | "closed_by_admin";

export function getEditionSituation(edition: Edition, products: Product[]): EditionSituation {
  if (edition.status === "closed") return "closed_by_admin";
  if (edition.opens_at && new Date(edition.opens_at).getTime() > Date.now()) return "scheduled";
  if (new Date(edition.order_deadline).getTime() < Date.now()) return "deadline_passed";
  const totalAvailable = products.reduce((sum, p) => sum + p.available_qty, 0);
  if (totalAvailable <= 0) return "sold_out";
  return "open";
}

export const SITUATION_LABEL: Record<EditionSituation, string> = {
  open: "Encomendas abertas",
  scheduled: "Abre em breve",
  deadline_passed: "Prazo de encomendas encerrado",
  sold_out: "Esgotado",
  closed_by_admin: "Encomendas encerradas",
};

export const SITUATION_TONE: Record<EditionSituation, "success" | "warning" | "danger"> = {
  open: "success",
  scheduled: "warning",
  deadline_passed: "warning",
  sold_out: "danger",
  closed_by_admin: "warning",
};

export function canOrder(situation: EditionSituation): boolean {
  return situation === "open";
}
