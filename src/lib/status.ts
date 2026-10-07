import type { FinanceExpenseStatus, FinancePaymentMethod, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão na entrega",
  cash: "Dinheiro",
};

export const FINANCE_PAYMENT_METHOD_LABEL: Record<FinancePaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};

export const FINANCE_EXPENSE_STATUS_LABEL: Record<FinanceExpenseStatus, string> = {
  previsto: "Previsto",
  pago: "Pago",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pagamento pendente",
  paid: "Pago",
  refund_pending: "Reembolso pendente",
  refunded: "Reembolsado",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  paid: "success",
  refund_pending: "danger",
  refunded: "danger",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_confirmation: "Aguardando confirmação",
  confirmed: "Confirmado",
  preparing: "Preparando",
  ready: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "warning" | "success" | "danger" | "info"> = {
  awaiting_confirmation: "warning",
  confirmed: "info",
  preparing: "info",
  ready: "info",
  out_for_delivery: "info",
  delivered: "success",
  cancelled: "danger",
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "awaiting_confirmation",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
];
