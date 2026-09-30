import { createClient } from "@/lib/supabase/server";
import { AdminOrdersScreen } from "@/components/admin/AdminOrdersScreen";
import type { AdminOrderRow, EditionOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = await createClient();

  const [{ data: orders }, { data: editions }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, editions(title, prep_date)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("editions").select("id, title, prep_date").order("prep_date", { ascending: false }),
  ]);

  return (
    <AdminOrdersScreen
      initialOrders={(orders ?? []) as unknown as AdminOrderRow[]}
      editions={(editions ?? []) as EditionOption[]}
    />
  );
}
