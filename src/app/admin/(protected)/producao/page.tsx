import { createClient } from "@/lib/supabase/server";
import { ProductionListScreen } from "@/components/admin/ProductionListScreen";
import type { EditionOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  const { edition: editionIdParam } = await searchParams;
  const supabase = await createClient();

  const { data: editions } = await supabase
    .from("editions")
    .select("id, title, prep_date")
    .order("prep_date", { ascending: false });

  const editionId =
    editionIdParam ?? (editions && editions.length > 0 ? editions[0].id : undefined);

  if (!editionId) {
    return (
      <ProductionListScreen
        editions={(editions ?? []) as EditionOption[]}
        selectedEditionId=""
        windows={[]}
        orders={[]}
      />
    );
  }

  const [{ data: windows }, { data: orders }] = await Promise.all([
    supabase
      .from("delivery_windows")
      .select("id, label, type, starts_at")
      .eq("edition_id", editionId)
      .order("starts_at", { ascending: true }),
    supabase
      .from("orders")
      .select(
        "id, customer_name, whatsapp, fulfillment_type, window_id, window_label_snapshot, order_status, created_at, order_items(product_name_snapshot, doneness, customer_note, qty)"
      )
      .eq("edition_id", editionId)
      .neq("order_status", "cancelled")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <ProductionListScreen
      editions={(editions ?? []) as EditionOption[]}
      selectedEditionId={editionId}
      windows={windows ?? []}
      orders={orders ?? []}
    />
  );
}
