// Configuração do Mercado Pago. Segredos só existem no servidor; a única
// coisa que vai pro navegador é a Public Key e o flag de ativação.

// A API exige vencimento do Pix entre 30 minutos e 30 dias
// (docs: checkout-api-payments/integration-configuration/integrate-pix).
export const PIX_MIN_EXPIRATION_MINUTES = 30;
export const PIX_MAX_EXPIRATION_MINUTES = 30 * 24 * 60;

export function onlinePaymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ONLINE_ENABLED === "true";
}

export function mercadoPagoPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? null;
}

export function requireAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN_NOT_CONFIGURED");
  return token;
}

export function webhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET ?? null;
}

// Credenciais de produção começam com "APP_USR-"; de teste, com "TEST-".
// É isso que define o live_mode que esperamos ver nos pagamentos: um pagamento
// de teste chegando numa instalação de produção é tratado como divergência.
export function expectedLiveMode(): boolean {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  return token.startsWith("APP_USR-");
}

export function pixExpirationMinutes(): number {
  const raw = Number(process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES ?? PIX_MIN_EXPIRATION_MINUTES);
  if (!Number.isFinite(raw)) return PIX_MIN_EXPIRATION_MINUTES;
  return Math.min(PIX_MAX_EXPIRATION_MINUTES, Math.max(PIX_MIN_EXPIRATION_MINUTES, Math.floor(raw)));
}

export function webhookUrl(): string | null {
  const explicit = process.env.MERCADOPAGO_WEBHOOK_URL;
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site ? `${site.replace(/\/$/, "")}/api/payments/mercadopago/webhook` : null;
}

export function reconcileSecret(): string | null {
  return process.env.PAYMENTS_RECONCILE_SECRET ?? null;
}
