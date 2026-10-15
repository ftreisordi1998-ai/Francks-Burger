import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./signature.ts";

const SECRET = "segredo-de-teste";

function sign(manifest: string) {
  return createHmac("sha256", SECRET).update(manifest).digest("hex");
}

test("aceita assinatura válida construída pelo manifesto oficial", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = sign(`id:12345;request-id:req-1;ts:${ts};`);
  const r = verifyWebhookSignature({
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: "req-1",
    dataId: "12345",
    secret: SECRET,
  });
  assert.equal(r.ok, true);
});

test("data.id alfanumérico entra em minúsculas no manifesto", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = sign(`id:abc123def;request-id:req-2;ts:${ts};`);
  const r = verifyWebhookSignature({
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: "req-2",
    dataId: "ABC123DEF",
    secret: SECRET,
  });
  assert.equal(r.ok, true);
});

test("rejeita assinatura com segredo errado", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", "outro").update(`id:1;request-id:r;ts:${ts};`).digest("hex");
  const r = verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "1", secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "SIGNATURE_MISMATCH");
});

test("rejeita quando o data.id da query não bate com o assinado", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = sign(`id:111;request-id:r;ts:${ts};`);
  const r = verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "222", secret: SECRET });
  assert.equal(r.ok, false);
});

test("rejeita timestamp antigo (replay)", () => {
  const ts = String(Math.floor(Date.now() / 1000) - 3600);
  const v1 = sign(`id:1;request-id:r;ts:${ts};`);
  const r = verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "r", dataId: "1", secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "TIMESTAMP_OUT_OF_RANGE");
});

test("rejeita cabeçalho ausente ou malformado", () => {
  assert.equal(verifyWebhookSignature({ xSignature: null, xRequestId: "r", dataId: "1", secret: SECRET }).ok, false);
  assert.equal(verifyWebhookSignature({ xSignature: "lixo", xRequestId: "r", dataId: "1", secret: SECRET }).ok, false);
  assert.equal(verifyWebhookSignature({ xSignature: "ts=1,v1=aa", xRequestId: "r", dataId: null, secret: SECRET }).ok, false);
});
