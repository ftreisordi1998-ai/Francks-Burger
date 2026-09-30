import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

const CONFIRMATION_MESSAGE = {
  title: "Franck's Burger",
  body: "Seu pedido foi confirmado e será preparado com todo o carinho do mundo! 🍔",
};

export async function POST(req: NextRequest) {
  const { orderId } = await req.json();
  if (!orderId) {
    return NextResponse.json({ error: "MISSING_ORDER_ID" }, { status: 400 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json({ error: "VAPID_NOT_CONFIGURED" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = await createClient();
  const { data: subscriptions, error } = await supabase.rpc("admin_get_push_subscriptions", {
    p_order_id: orderId,
  });
  if (error) {
    const status = error.message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  let sent = 0;
  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ ...CONFIRMATION_MESSAGE, url: "/" })
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.rpc("admin_remove_push_subscription", { p_endpoint: sub.endpoint });
      }
    }
  }

  await supabase.rpc("admin_mark_order_notified", { p_order_id: orderId });

  return NextResponse.json({ sent, total: subscriptions?.length ?? 0 });
}
