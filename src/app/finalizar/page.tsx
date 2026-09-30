import { getCurrentEdition } from "@/lib/data";
import { CheckoutScreen } from "@/components/CheckoutScreen";
import { NoEditionScreen } from "@/components/NoEditionScreen";

export const dynamic = "force-dynamic";

export default async function FinalizarPage() {
  const bundle = await getCurrentEdition();
  if (!bundle) return <NoEditionScreen />;

  return (
    <CheckoutScreen
      edition={bundle.edition}
      products={bundle.products}
      windows={bundle.windows}
      neighborhoods={bundle.neighborhoods}
    />
  );
}
