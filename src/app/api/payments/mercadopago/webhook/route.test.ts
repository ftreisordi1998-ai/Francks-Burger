import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Exercita o handler real do webhook nos caminhos que não dependem de banco
// nem do Mercado Pago: configuração ausente e assinatura inválida. Esses são
// justamente os que precisam falhar fechado.

const SECRET = "segredo-de-teste";
const URL_BASE = "https://exemplo.test/api/payments/mercadopago/webhook";

function makeReq(opts: { dataId: string; signature?: string; requestId?: string; body?: unknown }) {
  const url = `${URL_BASE}?type=payment&data.id=${encodeURIComponent(opts.dataId)}`;
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.signature) headers.set("x-signature", opts.signature);
  if (opts.requestId) headers.set("x-request-id", opts.requestId);
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? { type: "payment", action: "payment.updated", data: { id: opts.dataId } }),
  });
}

async function loadRoute() {
  const mod = await import("./route.ts");
  return mod.POST as (req: unknown) => Promise<Response>;
}

test("sem segredo configurado, recusa com 503 em vez de aceitar às cegas", async () => {
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const POST = await loadRoute();
  const res = await POST(makeReq({ dataId: "123", signature: "ts=1,v1=aa", requestId: "r" }));
  assert.equal(res.status, 503);
});

test("assinatura inválida é rejeitada com 401", async () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  const POST = await loadRoute();
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await POST(makeReq({ dataId: "123", signature: `ts=${ts},v1=deadbeef`, requestId: "r" }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string; reason: string };
  assert.equal(body.error, "INVALID_SIGNATURE");
  assert.equal(body.reason, "SIGNATURE_MISMATCH");
});

test("assinatura ausente é rejeitada", async () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  const POST = await loadRoute();
  const res = await POST(makeReq({ dataId: "123" }));
  assert.equal(res.status, 401);
});

test("assinatura de OUTRO data.id não serve para este (replay cruzado)", async () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  const POST = await loadRoute();
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", SECRET).update(`id:999;request-id:r;ts:${ts};`).digest("hex");
  const res = await POST(makeReq({ dataId: "123", signature: `ts=${ts},v1=${v1}`, requestId: "r" }));
  assert.equal(res.status, 401);
});
