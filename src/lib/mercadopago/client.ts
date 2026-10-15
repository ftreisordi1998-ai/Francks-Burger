import { requireAccessToken } from "./config";

// Cliente REST mínimo da API de Pagamentos (POST/GET /v1/payments).
// Optamos por fetch direto em vez do SDK Node para ter controle explícito do
// X-Idempotency-Key, dos timeouts e do contrato exato que a documentação
// descreve — a parte "oficial" obrigatória (tokenização do cartão e os
// Bricks) continua sendo o SDK JS no navegador.

const BASE_URL = "https://api.mercadopago.com";
const DEFAULT_TIMEOUT_MS = 15_000;

export class MercadoPagoApiError extends Error {
  // Campos declarados explicitamente (em vez de parameter properties) para o
  // módulo rodar também sob o type-stripping do Node, usado nos testes.
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "MercadoPagoApiError";
    this.status = status;
    this.body = body;
  }
}

export class MercadoPagoTimeoutError extends Error {
  constructor() {
    super("MERCADOPAGO_TIMEOUT");
    this.name = "MercadoPagoTimeoutError";
  }
}

export interface MpPayment {
  id: number;
  status: string;
  status_detail: string | null;
  transaction_amount: number;
  currency_id: string;
  live_mode: boolean;
  external_reference: string | null;
  date_approved: string | null;
  date_of_expiration: string | null;
  date_created: string;
  payment_method_id: string;
  payment_type_id: string;
  fee_details?: { type: string; amount: number; fee_payer: string }[];
  transaction_details?: { net_received_amount?: number; total_paid_amount?: number };
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
  [key: string]: unknown;
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${requireAccessToken()}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      throw new MercadoPagoApiError(`MERCADOPAGO_HTTP_${res.status}`, res.status, body);
    }
    return body as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new MercadoPagoTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface CreatePixPaymentInput {
  idempotencyKey: string;
  amount: number;
  description: string;
  externalReference: string;
  notificationUrl: string | null;
  dateOfExpirationIso: string;
  payer: { email: string; first_name?: string; last_name?: string };
}

export function createPixPayment(input: CreatePixPaymentInput) {
  return request<MpPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      transaction_amount: input.amount,
      payment_method_id: "pix",
      description: input.description,
      external_reference: input.externalReference,
      date_of_expiration: input.dateOfExpirationIso,
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      payer: input.payer,
    }),
  });
}

export interface CreateCardPaymentInput {
  idempotencyKey: string;
  amount: number;
  description: string;
  externalReference: string;
  notificationUrl: string | null;
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  payer: {
    email: string;
    identification?: { type: string; number: string };
  };
  statementDescriptor?: string;
}

export function createCardPayment(input: CreateCardPaymentInput) {
  return request<MpPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      transaction_amount: input.amount,
      token: input.token,
      description: input.description,
      // À vista por decisão de produto: parcelamento fica fora desta versão.
      installments: 1,
      payment_method_id: input.paymentMethodId,
      ...(input.issuerId !== undefined ? { issuer_id: input.issuerId } : {}),
      external_reference: input.externalReference,
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      ...(input.statementDescriptor ? { statement_descriptor: input.statementDescriptor } : {}),
      payer: input.payer,
    }),
  });
}

export function getPayment(id: string | number) {
  return request<MpPayment>(`/v1/payments/${id}`, { method: "GET" });
}

export async function searchPaymentsByExternalReference(externalReference: string) {
  const q = new URLSearchParams({ external_reference: externalReference, sort: "date_created", criteria: "desc" });
  const res = await request<{ results?: MpPayment[] }>(`/v1/payments/search?${q.toString()}`, { method: "GET" });
  return res.results ?? [];
}

export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function feeCents(p: MpPayment): number | null {
  if (!p.fee_details || p.fee_details.length === 0) return null;
  const total = p.fee_details.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  return Math.round(total * 100);
}

export function netCents(p: MpPayment): number | null {
  return toCents(p.transaction_details?.net_received_amount);
}
