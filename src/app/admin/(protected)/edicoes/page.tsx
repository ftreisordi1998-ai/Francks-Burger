import { createClient } from "@/lib/supabase/server";
import { EditionsListScreen } from "@/components/admin/EditionsListScreen";
import type { Edition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEditionsPage() {
  const supabase = await createClient();
  const { data: editions } = await supabase
    .from("editions")
    .select("*")
    .order("prep_date", { ascending: false });

  return <EditionsListScreen initialEditions={(editions ?? []) as Edition[]} />;
}
