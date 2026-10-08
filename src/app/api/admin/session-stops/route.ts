import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(req: NextRequest) {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { sessionId, stops } = (await req.json()) as {
    sessionId: string;
    stops: {
      stopIndex: number;
      orderId: string | null;
      customerName: string;
      whatsapp: string | null;
      address: string;
      items: string;
      lat: number;
      lng: number;
    }[];
  };
  if (typeof sessionId !== "string" || !Array.isArray(stops)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const rows = stops.map((s) => ({
    session_id: sessionId,
    stop_index: s.stopIndex,
    order_id: s.orderId,
    customer_name: s.customerName,
    whatsapp: s.whatsapp,
    address: s.address,
    items: s.items,
    lat: s.lat,
    lng: s.lng,
  }));

  const { error } = await supabase.from("delivery_session_stops").upsert(rows, {
    onConflict: "session_id,stop_index",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
