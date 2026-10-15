declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// `eventId` permite deduplicar o mesmo evento entre navegador e servidor
// (Conversions API) — para Purchase usamos o id do pedido, que é estável.
export function fbTrack(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (eventId) window.fbq("track", event, params, { eventID: eventId });
    else window.fbq("track", event, params);
  }
}
