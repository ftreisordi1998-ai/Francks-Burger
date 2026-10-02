import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrderDetailScreen } from "@/components/admin/OrderDetailScreen";
import type { AdminOrderRow, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, editions(title, prep_date)")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("edition_id", order.edition_id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return (
    <OrderDetailScreen
      order={order as unknown as AdminOrderRow}
      items={items ?? []}
      products={(products ?? []) as Product[]}
    />
  );
}
