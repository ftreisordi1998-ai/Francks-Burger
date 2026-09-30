import { createClient } from "@/lib/supabase/server";
import { AdminOrdersScreen } from "@/components/admin/AdminOrdersScreen";
import type { AdminOrderRow, Edition, EditionOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = await createClient();

  const [{ data: orders }, { data: editions }, { data: currentEditions }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, editions(title, prep_date)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("editions").select("id, title, prep_date").order("prep_date", { ascending: false }),
    supabase
      .from("editions")
      .select("*")
      .neq("status", "draft")
      .order("order_deadline", { ascending: false })
      .limit(1),
  ]);

  return (
    <AdminOrdersScreen
      initialOrders={(orders ?? []) as unknown as AdminOrderRow[]}
      editions={(editions ?? []) as EditionOption[]}
      currentEdition={(currentEditions?.[0] as Edition) ?? null}
    />
  );
}
