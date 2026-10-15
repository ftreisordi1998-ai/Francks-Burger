import { createServiceClient } from "@/lib/supabase/service";
import { webhookSecret } from "@/lib/mercadopago/config";
import { verifyWebhookSignature } from "@/lib/mercadopago/signature";
import { getPayment } from "@/lib/mercadopago/client";
import { applyPaymentToAttempt, findOrBindAttempt } from "@/lib/mercadopago/sync";

// Usa Request/Response padrão (e não NextRequest/NextResponse) de propósito:
// assim o handler roda sem o bundler e pode ser testado direto no runner do
// Node, que é o que garante que os caminhos de recusa falhem fechado.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contrato (docs oficiais): POST JSON, query `data.id` + `type`, headers
// x-signature / x-request-id. Devemos responder 200/201 em até 22s; o
// provedor reenvia em caso de falha. Nunca confiamos no corpo: validamos a
// assinatura, PERSISTIMOS o evento e só então reconsultamos a API.

export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) {
    // Sem segredo configurado não há como autenticar a origem: recusar é a
    // única opção segura. O provedor vai reenviar quando estiver configurado.
    return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);
  }

  const params = new URL(req.url).searchParams;
  const dataId = params.get("data.id");
  const topic = params.get("type") ?? params.get("topic");
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  const check = verifyWebhookSignature({ xSignature, xRequestId, dataId, secret });
  if (!check.ok) {
    return json({ error: "INVALID_SIGNATURE", reason: check.reason }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action : null;
  const bodyType = typeof body.type === "string" ? body.type : topic;
  const bodyData = (body.data ?? {}) as { id?: string | number };
  const providerPaymentId = String(bodyData.id ?? dataId ?? "");
  const providerEventId = body.id !== undefined ? String(body.id) : null;

  const db = createServiceClient();

  // 1) Persistir ANTES de qualquer processamento. Se o passo seguinte falhar,
  //    a conciliação reprocessa a partir daqui.
  const { data: event, error: insertError } = await db
    .from("payment_webhook_events")
    .insert({
      provider: "mercadopago",
      provider_event_id: providerEventId,
      provider_payment_id: providerPaymentId || null,
      action,
      request_id: xRequestId,
      signature_ts: check.ts,
      payload: body,
    })
    .select("id")
    .single();
  if (insertError || !event) {
    // Sem persistência não podemos dar 200: o provedor deve reenviar.
    return json({ error: "PERSIST_FAILED" }, 500);
  }

  // 2) Só processamos o tópico de pagamento. Outros tópicos ficam registrados.
  if (bodyType !== "payment" || !providerPaymentId) {
    await db
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString(), process_result: "IGNORED_TOPIC" })
      .eq("id", event.id);
    return json({ ok: true });
  }

  // 3) Reconsultar o recurso no provedor e aplicar. Erros aqui não viram
  //    5xx: o evento já está salvo e a conciliação o retomará.
  let result = "PROCESSED";
  let errorText: string | null = null;
  try {
    const payment = await getPayment(providerPaymentId);
    const attemptId = await findOrBindAttempt(db, payment);
    if (!attemptId) {
      result = "UNMATCHED_PAYMENT";
    } else {
      const applied = await applyPaymentToAttempt(db, attemptId, payment);
      result = applied.applied ? `APPLIED:${applied.attempt_status}` : `SKIPPED:${applied.reason}`;
    }
  } catch (err) {
    result = "PROCESS_ERROR";
    errorText = err instanceof Error ? err.message : String(err);
  }

  await db
    .from("payment_webhook_events")
    .update({ processed_at: new Date().toISOString(), process_result: result, error: errorText })
    .eq("id", event.id);

  return json({ ok: true });
}
