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
        "id, customer_name, whatsapp, fulfillment_type, window_id, window_label_snapshot, address_street, address_number, address_complement, address_reference, neighborhood_name_snapshot, notes, subtotal_cents, delivery_fee_cents, total_cents, cash_change_for_cents, order_status, payment_method, payment_status, payment_confirmed_at, payment_confirmed_by, delivered_at, cancel_reason, created_at, order_items(product_name_snapshot, doneness, customer_note, qty)"
      )
      .eq("edition_id", editionId)
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
