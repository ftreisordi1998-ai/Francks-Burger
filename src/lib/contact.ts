export const STORE_WHATSAPP_NUMBER = "5543999888724";

export function buildStoreWhatsAppUrl(message: string) {
  return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
