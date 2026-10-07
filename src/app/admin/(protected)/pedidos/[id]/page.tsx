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

  // O WhatsApp é digitado livre (sem máscara), então o mesmo número pode estar
  // salvo com formatações diferentes entre pedidos — comparar só os dígitos.
  const digits = order.whatsapp.replace(/\D/g, "");
  const { data: candidateOrders } = await supabase
    .from("orders")
    .select("id, whatsapp, created_at, order_status, editions(title)")
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  const previousOrders = (candidateOrders ?? [])
    .filter((o) => o.whatsapp.replace(/\D/g, "") === digits && digits.length > 0)
    .map((o) => ({
      id: o.id,
      created_at: o.created_at,
      order_status: o.order_status,
      edition_title: (o.editions as unknown as { title: string } | null)?.title ?? "",
    }));

  return (
    <OrderDetailScreen
      order={order as unknown as AdminOrderRow}
      items={items ?? []}
      products={(products ?? []) as Product[]}
      previousOrders={previousOrders}
    />
  );
}
