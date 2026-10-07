declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function gtagEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
}
