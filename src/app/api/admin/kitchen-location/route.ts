import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET() {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { data } = await supabase.from("kitchen_location").select("*").eq("id", "default").maybeSingle();
  return NextResponse.json({ location: data ?? null });
}

export async function POST(req: NextRequest) {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { address_street, address_number, neighborhood, lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "MISSING_COORDS" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("kitchen_location")
    .upsert({
      id: "default",
      address_street: address_street ?? null,
      address_number: address_number ?? null,
      neighborhood: neighborhood ?? null,
      lat,
      lng,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ location: data });
}
