import { createHmac, timingSafeEqual } from "node:crypto";

// Validação da origem do webhook, conforme a documentação oficial
// (your-integrations/notifications/webhooks):
//   header x-signature  -> "ts=<unix>,v1=<hmac hex>"
//   header x-request-id -> identificador da requisição
//   query  data.id      -> id do recurso notificado
//   manifesto           -> "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
//   HMAC-SHA256(manifesto, secret) deve bater com v1.
// data.id alfanumérico entra em minúsculas no manifesto.

export type SignatureCheck =
  | { ok: true; ts: string }
  | { ok: false; reason: string };

const MAX_SKEW_SECONDS = 15 * 60;

export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  now?: number;
}): SignatureCheck {
  const { xSignature, xRequestId, dataId, secret } = params;
  if (!xSignature) return { ok: false, reason: "MISSING_SIGNATURE" };
  if (!dataId) return { ok: false, reason: "MISSING_DATA_ID" };

  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "ts") ts = v ?? null;
    if (k === "v1") v1 = v ?? null;
  }
  if (!ts || !v1) return { ok: false, reason: "MALFORMED_SIGNATURE" };

  const tsNum = Number(ts);
  const nowSec = Math.floor((params.now ?? Date.now()) / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "TIMESTAMP_OUT_OF_RANGE" };
  }

  const normalizedId = /[a-zA-Z]/.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest =
    `id:${normalizedId};` + (xRequestId ? `request-id:${xRequestId};` : "") + `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "SIGNATURE_MISMATCH" };
  }
  return { ok: true, ts };
}
