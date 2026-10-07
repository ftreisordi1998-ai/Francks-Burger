import { CourierTrackingScreen } from "@/components/CourierTrackingScreen";

export const dynamic = "force-dynamic";

export default async function EntregaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CourierTrackingScreen token={token} />;
}
