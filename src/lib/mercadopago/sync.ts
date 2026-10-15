import type { SupabaseClient } from "@supabase/supabase-js";
import { expectedLiveMode } from "./config";
import { feeCents, getPayment, netCents, toCents, type MpPayment } from "./client";

// Caminho único para "levar o estado do provedor ao banco". Usado pelo
// webhook, pela consulta de status e pela conciliação — assim todos aplicam
// exatamente as mesmas regras (em apply_provider_payment_state).

export interface ApplyResult {
  applied: boolean;
  reason?: string;
  attempt_status: string;
  order_confirmed?: boolean;
  resolution_required?: boolean;
  resolution_reason?: string | null;
}

function sanitizeForStorage(p: MpPayment): Record<string, unknown> {
  // Guardamos o payload para auditoria, mas sem dados do portador do cartão.
  const copy: Record<string, unknown> = { ...p };
  delete copy.card;
  delete copy.payer;
  delete copy.additional_info;
  return copy;
}

export async function applyPaymentToAttempt(
  db: SupabaseClient,
  attemptId: string,
  payment: MpPayment
): Promise<ApplyResult> {
  const { data, error } = await db.rpc("apply_provider_payment_state", {
    p_attempt_id: attemptId,
    p_provider_payment_id: String(payment.id),
    p_status: payment.status,
    p_status_detail: payment.status_detail ?? null,
    p_amount_cents: toCents(payment.transaction_amount),
    p_currency: payment.currency_id ?? null,
    p_live_mode: payment.live_mode ?? null,
    p_expected_live_mode: expectedLiveMode(),
    p_date_approved: payment.date_approved ?? null,
    p_date_of_expiration: payment.date_of_expiration ?? null,
    p_fee_cents: feeCents(payment),
    p_net_cents: netCents(payment),
    p_payload: sanitizeForStorage(payment),
  });
  if (error) throw new Error(`APPLY_STATE_FAILED: ${error.message}`);
  return data as ApplyResult;
}

// Reconsulta o provedor e aplica. É o que o webhook faz depois de validar a
// assinatura: o corpo da notificação só diz "olha o pagamento X".
export async function syncAttemptFromProvider(
  db: SupabaseClient,
  attemptId: string,
  providerPaymentId: string
): Promise<{ payment: MpPayment; result: ApplyResult }> {
  const payment = await getPayment(providerPaymentId);
  const result = await applyPaymentToAttempt(db, attemptId, payment);
  return { payment, result };
}

// Dada uma notificação de pagamento X, encontra a tentativa correspondente.
// 1) pelo provider_payment_id; 2) se a criação ficou sem resposta (timeout),
// pelo external_reference (= id do pedido) + valor + método, vinculando então.
export async function findOrBindAttempt(
  db: SupabaseClient,
  payment: MpPayment
): Promise<string | null> {
  const byId = await db
    .from("payment_attempts")
    .select("id")
    .eq("provider", "mercadopago")
    .eq("provider_payment_id", String(payment.id))
    .maybeSingle();
  if (byId.data?.id) return byId.data.id as string;

  if (!payment.external_reference) return null;
  const method = payment.payment_method_id === "pix" ? "pix" : "credit_card";
  const amount = toCents(payment.transaction_amount);

  const orphan = await db
    .from("payment_attempts")
    .select("id")
    .eq("provider", "mercadopago")
    .eq("order_id", payment.external_reference)
    .is("provider_payment_id", null)
    .eq("status", "creating")
    .eq("method", method)
    .eq("amount_cents", amount)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!orphan.data?.id) return null;

  const bind = await db
    .from("payment_attempts")
    .update({ provider_payment_id: String(payment.id), updated_at: new Date().toISOString() })
    .eq("id", orphan.data.id)
    .is("provider_payment_id", null)
    .select("id")
    .maybeSingle();
  return bind.data?.id ?? null;
}
