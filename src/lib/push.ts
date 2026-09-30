import { createClient } from "@/lib/supabase/client";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad Safari only exposes the Push API to installed (home screen) web apps. */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Android Chrome/Firefox support push in a regular browser tab — no install step needed. */
export function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Registers the service worker and creates a browser push subscription,
 * requesting permission if needed. Does not associate it with any order yet.
 */
export async function ensurePushSubscription(): Promise<PushSubscription> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error("VAPID_NOT_CONFIGURED");

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("PERMISSION_DENIED");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function linkPushSubscriptionToOrder(orderToken: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  const supabase = createClient();
  const { error } = await supabase.rpc("subscribe_order_push", {
    p_token: orderToken,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  });
  if (error) throw error;
}

/** Used on the order tracking page as a fallback for people who land there directly. */
export async function subscribeToOrderPush(orderToken: string) {
  const subscription = await ensurePushSubscription();
  await linkPushSubscriptionToOrder(orderToken, subscription);
  return subscription;
}

/** Silently attaches an already-granted subscription to a freshly created order, with no prompt. */
export async function silentlyLinkExistingSubscription(orderToken: string) {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  try {
    const subscription = await ensurePushSubscription();
    await linkPushSubscriptionToOrder(orderToken, subscription);
  } catch {
    // best-effort — never block checkout on this
  }
}
