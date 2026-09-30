import { createClient } from "@/lib/supabase/server";
import type { DeliveryWindow, Edition, Neighborhood, Product } from "./types";

export interface EditionBundle {
  edition: Edition;
  products: Product[];
  windows: DeliveryWindow[];
  neighborhoods: Neighborhood[];
}

export async function getCurrentEdition(): Promise<EditionBundle | null> {
  const supabase = await createClient();

  const { data: editions } = await supabase
    .from("editions")
    .select("*")
    .neq("status", "draft")
    .order("order_deadline", { ascending: false })
    .limit(1);

  const edition = editions?.[0] as Edition | undefined;
  if (!edition) return null;

  const [{ data: products }, { data: windows }, { data: neighborhoods }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("edition_id", edition.id)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("delivery_windows")
      .select("*")
      .eq("edition_id", edition.id)
      .eq("active", true)
      .order("starts_at", { ascending: true }),
    supabase
      .from("neighborhoods")
      .select("*")
      .eq("edition_id", edition.id)
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);

  return {
    edition,
    products: (products ?? []) as Product[],
    windows: (windows ?? []) as DeliveryWindow[],
    neighborhoods: (neighborhoods ?? []) as Neighborhood[],
  };
}
