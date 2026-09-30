import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditionEditorScreen } from "@/components/admin/EditionEditorScreen";
import type { DeliveryWindow, Edition, Neighborhood, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: edition } = await supabase.from("editions").select("*").eq("id", id).maybeSingle();
  if (!edition) notFound();

  const [{ data: products }, { data: windows }, { data: neighborhoods }, { data: orderItems }] =
    await Promise.all([
      supabase.from("products").select("*").eq("edition_id", id).order("sort_order"),
      supabase.from("delivery_windows").select("*").eq("edition_id", id).order("starts_at"),
      supabase.from("neighborhoods").select("*").eq("edition_id", id).order("name"),
      supabase
        .from("order_items")
        .select("product_id, qty, orders!inner(edition_id, order_status, payment_status, delivery_fee_cents)")
        .eq("orders.edition_id", id),
    ]);

  const { data: orders } = await supabase
    .from("orders")
    .select("order_status, payment_status, total_cents, delivery_fee_cents")
    .eq("edition_id", id);

  return (
    <EditionEditorScreen
      edition={edition as Edition}
      initialProducts={(products ?? []) as Product[]}
      initialWindows={(windows ?? []) as DeliveryWindow[]}
      initialNeighborhoods={(neighborhoods ?? []) as Neighborhood[]}
      orderItemsForStats={
        (orderItems ?? []) as unknown as {
          product_id: string;
          qty: number;
          orders: { order_status: string; payment_status: string };
        }[]
      }
      orders={(orders ?? []) as { order_status: string; payment_status: string; total_cents: number; delivery_fee_cents: number }[]}
    />
  );
}
