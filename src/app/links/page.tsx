import type { Metadata } from "next";
import { getCurrentEdition } from "@/lib/data";
import { canOrder, getEditionSituation } from "@/lib/edition-state";
import { LinksScreen } from "@/components/LinksScreen";

const title = "Franck's Burger | Encomendas e novidades";
const description =
  "Burgers na brasa em Uraí. Faça sua encomenda e entre no grupo para acompanhar as próximas edições.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/links" },
  openGraph: {
    title,
    description,
    url: "/links",
    siteName: "Franck's Burger",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Franck's Burger" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const bundle = await getCurrentEdition();
  const ordersOpen = bundle ? canOrder(getEditionSituation(bundle.edition, bundle.products)) : false;

  return <LinksScreen ordersOpen={ordersOpen} />;
}
