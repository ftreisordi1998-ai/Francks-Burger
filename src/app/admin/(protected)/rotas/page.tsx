import { createClient } from "@/lib/supabase/server";
import { RoutePlannerScreen } from "@/components/admin/RoutePlannerScreen";
import type { EditionOption, KitchenLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminRotasPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  const { edition: editionIdParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: editions }, { data: kitchen }] = await Promise.all([
    supabase.from("editions").select("id, title, prep_date").order("prep_date", { ascending: false }),
    supabase.from("kitchen_location").select("*").eq("id", "default").maybeSingle(),
  ]);

  const editionId =
    editionIdParam ?? (editions && editions.length > 0 ? editions[0].id : undefined);

  const { data: windows } = editionId
    ? await supabase
        .from("delivery_windows")
        .select("id, label, starts_at")
        .eq("edition_id", editionId)
        .eq("type", "delivery")
        .order("starts_at", { ascending: true })
    : { data: [] };

  return (
    <RoutePlannerScreen
      editions={(editions ?? []) as EditionOption[]}
      selectedEditionId={editionId ?? ""}
      windows={windows ?? []}
      kitchenLocation={(kitchen as KitchenLocation | null) ?? null}
    />
  );
}
