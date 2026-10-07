import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { geocodeAddress } from "@/lib/mapbox";

export async function POST(req: NextRequest) {
  const { ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { query } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "MISSING_QUERY" }, { status: 400 });
  }

  try {
    const candidates = await geocodeAddress(query);
    return NextResponse.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GEOCODE_FAILED";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
