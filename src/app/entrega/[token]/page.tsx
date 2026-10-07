import type { Metadata } from "next";
import { CourierTrackingScreen } from "@/components/CourierTrackingScreen";

export const dynamic = "force-dynamic";

const title = "Rastreamento de entrega — Franck's Burger";
const description = "Toque para iniciar e compartilhar sua localização durante a entrega.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [{ url: "/logo.png", width: 400, height: 400, alt: "Franck's Burger" }],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/logo.png"],
  },
};

export default async function EntregaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CourierTrackingScreen token={token} />;
}
