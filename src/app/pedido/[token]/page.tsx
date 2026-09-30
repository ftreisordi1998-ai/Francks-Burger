import { createClient } from "@/lib/supabase/server";
import { OrderTrackingScreen } from "@/components/OrderTrackingScreen";
import { notFound } from "next/navigation";
import type { OrderTrackingView } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_order_by_token", { p_token: token });

  if (!data) notFound();

  return <OrderTrackingScreen order={data as OrderTrackingView} />;
}
