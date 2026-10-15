import type {
  FinanceExpenseStatus,
  FinancePaymentMethod,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
} from "./types";

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

// Estados reais da API de pagamentos do Mercado Pago (status da cobrança),
// separados do status do pedido.
export const PAYMENT_ATTEMPT_STATUS_LABEL: Record<PaymentAttemptStatus, string> = {
  creating: "Criando cobrança",
  pending: "Aguardando pagamento",
  in_process: "Em análise",
  authorized: "Autorizado (aguardando captura)",
  in_mediation: "Em disputa",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado / expirado",
  refunded: "Estornado",
  charged_back: "Contestado (chargeback)",
};

export const PAYMENT_ATTEMPT_STATUS_TONE: Record<PaymentAttemptStatus, "warning" | "success" | "danger" | "info"> = {
  creating: "warning",
  pending: "warning",
  in_process: "info",
  authorized: "info",
  in_mediation: "danger",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
  refunded: "danger",
  charged_back: "danger",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Aguardando pagamento",
  proof_submitted: "Comprovante enviado — em conferência",
  paid: "Pagamento confirmado",
  refund_pending: "Reembolso pendente",
  refunded: "Reembolsado",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "warning" | "success" | "danger" | "info"> = {
  pending: "warning",
  proof_submitted: "info",
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
