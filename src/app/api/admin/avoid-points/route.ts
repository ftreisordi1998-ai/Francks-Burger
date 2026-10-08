import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET() {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { data, error } = await supabase
    .from("route_avoid_points")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ points: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { lat, lng, label } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "MISSING_COORDS" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("route_avoid_points")
    .insert({ lat, lng, label: label ?? null })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ point: data });
}

export async function DELETE(req: NextRequest) {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await req.json();
  if (typeof id !== "string") return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const { error } = await supabase.from("route_avoid_points").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
