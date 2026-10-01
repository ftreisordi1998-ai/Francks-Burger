export const STORE_WHATSAPP_NUMBER = "5543999888724";

export function buildWhatsAppUrl(fullNumberDigits: string, message?: string) {
  const base = `https://wa.me/${fullNumberDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function buildStoreWhatsAppUrl(message: string) {
  return buildWhatsAppUrl(STORE_WHATSAPP_NUMBER, message);
}

/** `rawPhone` is the customer's own WhatsApp field (DDD + número, sem código do país). */
export function buildCustomerWhatsAppUrl(rawPhone: string, message?: string) {
  const digits = rawPhone.replace(/\D/g, "");
  return buildWhatsAppUrl(`55${digits}`, message);
}
