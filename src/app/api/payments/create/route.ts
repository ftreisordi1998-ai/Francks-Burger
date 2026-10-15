import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  onlinePaymentsEnabled,
  PIX_MIN_EXPIRATION_MINUTES,
  pixExpirationMinutes,
  webhookUrl,
} from "@/lib/mercadopago/config";
import {
  createCardPayment,
  createPixPayment,
  MercadoPagoApiError,
  MercadoPagoTimeoutError,
  type MpPayment,
} from "@/lib/mercadopago/client";
import { applyPaymentToAttempt } from "@/lib/mercadopago/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cria (ou recupera) a cobrança de um pedido já existente. O pedido, a
// reserva e o total já foram validados e calculados pelo place_order; aqui o
// navegador só diz "quero pagar o pedido X por Pix/cartão" — valor, moeda e
// prazo saem do banco.

type Body = {
  token?: string;
  method?: "pix" | "credit_card";
  payer?: { email?: string; first_name?: string; last_name?: string; identification?: { type?: string; number?: string } };
  card?: { token?: string; payment_method_id?: string; issuer_id?: string | number };
};

const TOKEN_RE = /^[a-f0-9]{16,64}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(code: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

function attemptView(a: Record<string, unknown>) {
  return {
    id: a.id,
    method: a.method,
    status: a.status,
    status_detail: a.status_detail,
    amount_cents: a.amount_cents,
    date_of_expiration: a.date_of_expiration,
    qr_code: a.qr_code,
    qr_code_base64: a.qr_code_base64,
    ticket_url: a.ticket_url,
  };
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    // Configuração ausente (service role, access token) e qualquer outra
    // falha inesperada viram erro tratado: o cliente recebe uma mensagem em
    // vez de um 500 em HTML, e o segredo nunca aparece na resposta.
    const code = err instanceof Error ? err.message : "UNEXPECTED";
    const isConfig = code.endsWith("_NOT_CONFIGURED");
    console.error("[payments/create]", code);
    return fail(isConfig ? "PAYMENTS_NOT_CONFIGURED" : "UNEXPECTED_ERROR", isConfig ? 503 : 500);
  }
}

async function handle(req: NextRequest) {
  if (!onlinePaymentsEnabled()) return fail("ONLINE_PAYMENTS_DISABLED", 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("INVALID_BODY");
  }
  const token = body.token ?? "";
  const method = body.method;
  const email = body.payer?.email?.trim() ?? "";
  if (!TOKEN_RE.test(token)) return fail("INVALID_TOKEN");
  if (method !== "pix" && method !== "credit_card") return fail("INVALID_METHOD");
  if (!EMAIL_RE.test(email)) return fail("INVALID_EMAIL");

  const db = createServiceClient();

  const { data: order } = await db
    .from("orders")
    .select(
      "id, edition_id, public_token, customer_name, total_cents, payment_status, order_status, payment_provider, expires_at"
    )
    .eq("public_token", token)
    .maybeSingle();
  if (!order) return fail("ORDER_NOT_FOUND", 404);

  const { data: edition } = await db
    .from("editions")
    .select("id, status, opens_at, order_deadline")
    .eq("id", order.edition_id)
    .single();
  if (!edition) return fail("EDITION_NOT_FOUND", 404);

  const now = Date.now();
  const deadlineMs = new Date(edition.order_deadline).getTime();

  // --- Regras de aceitação (servidor) -------------------------------------
  if (order.payment_status === "paid") return fail("ALREADY_PAID", 409);
  if (order.order_status !== "awaiting_confirmation") return fail("ORDER_NOT_PAYABLE", 409);
  if (order.payment_provider && order.payment_provider !== "mercadopago") return fail("ORDER_NOT_PAYABLE", 409);
  if (edition.status !== "open") return fail("EDITION_CLOSED", 409);
  if (edition.opens_at && new Date(edition.opens_at).getTime() > now) return fail("NOT_OPEN_YET", 409);
  if (deadlineMs <= now) return fail("DEADLINE_PASSED", 409);
  if (order.expires_at && new Date(order.expires_at).getTime() <= now) return fail("RESERVATION_EXPIRED", 409);

  // Qualquer tentativa que ainda possa virar dinheiro impede uma nova cobrança.
  const { data: attempts } = await db
    .from("payment_attempts")
    .select("*")
    .eq("order_id", order.id)
    .eq("provider", "mercadopago")
    .order("created_at", { ascending: false });
  const list = (attempts ?? []) as Record<string, unknown>[];

  const blocking = list.find((a) => ["approved", "in_process", "authorized", "in_mediation"].includes(String(a.status)));
  if (blocking) {
    return NextResponse.json({ reused: true, attempt: attemptView(blocking) });
  }

  // Marca o pedido como "online" antes de falar com o provedor, para o job de
  // expiração antigo parar de considerá-lo (a conciliação assume daqui).
  if (!order.payment_provider) {
    await db.from("orders").update({ payment_provider: "mercadopago" }).eq("id", order.id);
  }

  const amount = order.total_cents / 100;
  const description = `Franck's Burger — pedido ${String(order.id).slice(0, 8).toUpperCase()}`;
  const notificationUrl = webhookUrl();

  // =========================== PIX ========================================
  if (method === "pix") {
    // Reaproveita uma cobrança Pix ainda válida (recarregou a página, etc.).
    const livePix = list.find(
      (a) =>
        a.method === "pix" &&
        a.status === "pending" &&
        a.date_of_expiration &&
        new Date(String(a.date_of_expiration)).getTime() > now + 30_000
    );
    if (livePix) return NextResponse.json({ reused: true, attempt: attemptView(livePix) });

    // Vencimento: o configurado, mas nunca depois do encerramento das
    // encomendas nem da expiração da reserva. Se o que sobra for menor que
    // o mínimo da API, não há cobrança válida possível.
    const configuredMs = pixExpirationMinutes() * 60_000;
    const reservationMs = order.expires_at ? new Date(order.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const expiresAtMs = Math.min(now + configuredMs, deadlineMs, reservationMs);
    const minMs = PIX_MIN_EXPIRATION_MINUTES * 60_000;
    if (expiresAtMs - now < minMs) {
      return fail("PIX_WINDOW_TOO_SHORT", 409, {
        message: `O Pix precisa de pelo menos ${PIX_MIN_EXPIRATION_MINUTES} minutos de validade e as encomendas encerram antes disso.`,
      });
    }

    // Criação que ficou sem resposta (timeout): repete com a MESMA chave de
    // idempotência, como a API prevê, em vez de abrir outra cobrança.
    const creating = list.find((a) => a.method === "pix" && a.status === "creating" && !a.provider_payment_id);
    const idempotencyKey = creating ? String(creating.idempotency_key) : randomUUID();
    const expirationIso = new Date(expiresAtMs).toISOString();

    let attemptId: string;
    if (creating) {
      attemptId = String(creating.id);
    } else {
      const { data: inserted, error } = await db
        .from("payment_attempts")
        .insert({
          order_id: order.id,
          provider: "mercadopago",
          idempotency_key: idempotencyKey,
          method: "pix",
          status: "creating",
          amount_cents: order.total_cents,
          currency: "BRL",
          date_of_expiration: expirationIso,
        })
        .select("id")
        .single();
      if (error || !inserted) return fail("ATTEMPT_PERSIST_FAILED", 500);
      attemptId = inserted.id as string;
    }

    let payment: MpPayment;
    try {
      payment = await createPixPayment({
        idempotencyKey,
        amount,
        description,
        externalReference: order.id,
        notificationUrl,
        dateOfExpirationIso: expirationIso,
        payer: {
          email,
          first_name: body.payer?.first_name?.trim() || order.customer_name.split(" ")[0],
          last_name: body.payer?.last_name?.trim() || undefined,
        },
      });
    } catch (err) {
      if (err instanceof MercadoPagoTimeoutError) {
        // A tentativa fica em "creating"; a conciliação (ou o próximo clique)
        // recupera pela chave de idempotência / external_reference.
        return fail("PROVIDER_TIMEOUT", 504);
      }
      if (err instanceof MercadoPagoApiError) {
        await db
          .from("payment_attempts")
          .update({ status: "cancelled", status_detail: `create_failed_http_${err.status}`, last_provider_payload: err.body as never })
          .eq("id", attemptId);
        return fail("PROVIDER_REJECTED", 502);
      }
      throw err;
    }

    const td = payment.point_of_interaction?.transaction_data ?? {};
    await db
      .from("payment_attempts")
      .update({
        qr_code: td.qr_code ?? null,
        qr_code_base64: td.qr_code_base64 ?? null,
        ticket_url: td.ticket_url ?? null,
      })
      .eq("id", attemptId);
    await applyPaymentToAttempt(db, attemptId, payment);

    const { data: fresh } = await db.from("payment_attempts").select("*").eq("id", attemptId).single();
    return NextResponse.json({ reused: false, attempt: attemptView(fresh as Record<string, unknown>) });
  }

  // =========================== CARTÃO =====================================
  const card = body.card;
  if (!card?.token || !card.payment_method_id) return fail("CARD_DATA_REQUIRED");

  const idempotencyKey = randomUUID();
  const { data: inserted, error } = await db
    .from("payment_attempts")
    .insert({
      order_id: order.id,
      provider: "mercadopago",
      idempotency_key: idempotencyKey,
      method: "credit_card",
      status: "creating",
      amount_cents: order.total_cents,
      currency: "BRL",
    })
    .select("id")
    .single();
  if (error || !inserted) return fail("ATTEMPT_PERSIST_FAILED", 500);
  const attemptId = inserted.id as string;

  let payment: MpPayment;
  try {
    payment = await createCardPayment({
      idempotencyKey,
      amount,
      description,
      externalReference: order.id,
      notificationUrl,
      token: card.token,
      paymentMethodId: card.payment_method_id,
      issuerId: card.issuer_id,
      statementDescriptor: "FRANCKS BURGER",
      payer: {
        email,
        ...(body.payer?.identification?.type && body.payer.identification.number
          ? { identification: { type: body.payer.identification.type, number: body.payer.identification.number } }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof MercadoPagoTimeoutError) return fail("PROVIDER_TIMEOUT", 504);
    if (err instanceof MercadoPagoApiError) {
      await db
        .from("payment_attempts")
        .update({ status: "cancelled", status_detail: `create_failed_http_${err.status}`, last_provider_payload: err.body as never })
        .eq("id", attemptId);
      return fail("PROVIDER_REJECTED", 502);
    }
    throw err;
  }

  const applied = await applyPaymentToAttempt(db, attemptId, payment);
  const { data: fresh } = await db.from("payment_attempts").select("*").eq("id", attemptId).single();
  return NextResponse.json({
    reused: false,
    attempt: attemptView(fresh as Record<string, unknown>),
    order_confirmed: applied.order_confirmed ?? false,
    resolution_required: applied.resolution_required ?? false,
  });
}
