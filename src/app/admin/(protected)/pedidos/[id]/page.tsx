import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrderDetailScreen } from "@/components/admin/OrderDetailScreen";
import type { AdminOrderRow } from "@/lib/types";

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

  return (
    <OrderDetailScreen order={order as unknown as AdminOrderRow} items={items ?? []} />
  );
}
