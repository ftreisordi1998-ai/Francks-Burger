"use client";

import { useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import { Badge } from "./Badge";
import { ProductCard } from "./ProductCard";
import { ProductSheet } from "./ProductSheet";
import { CartBar } from "./CartBar";
import { SocialFooter } from "./SocialFooter";
import { useCart } from "@/lib/cart-context";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime, formatWeekday } from "@/lib/format";
import {
  canOrder,
  getEditionSituation,
  SITUATION_LABEL,
  SITUATION_TONE,
} from "@/lib/edition-state";
import type { DeliveryWindow, Edition, Neighborhood, Product } from "@/lib/types";

export function EditionScreen({
  edition,
  initialProducts,
  windows,
  neighborhoods,
}: {
  edition: Edition;
  initialProducts: Product[];
  windows: DeliveryWindow[];
  neighborhoods: Neighborhood[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const { setEdition, getQty, getLinesForProduct, upsertLine, updateLineQty, removeLine } =
    useCart();
  const { alertDialog } = useDialog();

  useEffect(() => {
    setEdition(edition.id);
  }, [edition.id, setEdition]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`edition-${edition.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `edition_id=eq.${edition.id}` },
        (payload) => {
          setProducts((prev) =>
            prev.map((p) => (p.id === payload.new.id ? { ...p, ...(payload.new as Product) } : p))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [edition.id]);

  const situation = useMemo(() => getEditionSituation(edition, products), [edition, products]);
  const orderingEnabled = canOrder(situation);

  const deliveryWindows = windows.filter((w) => w.type === "delivery");
  const pickupWindows = edition.pickup_enabled ? windows.filter((w) => w.type === "pickup") : [];

  async function handleOpenProduct(product: Product) {
    if (orderingEnabled) {
      setActiveProduct(product);
      return;
    }
    const messages: Record<string, string> = {
      sold_out: "Esta edição esgotou. Fique de olho para a próxima.",
      deadline_passed: "O prazo para encomendar nesta edição já passou.",
      closed_by_admin: "As encomendas desta edição não estão mais abertas.",
    };
    await alertDialog({
      title: "Loja fechada no momento",
      message: messages[situation] ?? "Não é possível fazer pedidos agora.",
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-32 lg:max-w-[1140px]">
      <header className="px-5 pb-4 pt-[calc(env(safe-area-inset-top)+18px)] lg:px-8 lg:pt-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={52} />
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-orange">
                Burgers na brasa, por encomenda
              </p>
              <h1 className="text-xl font-extrabold leading-tight text-coffee lg:text-2xl">
                {edition.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Badge tone={SITUATION_TONE[situation]}>{SITUATION_LABEL[situation]}</Badge>
              <span className="text-sm text-coffee-soft">
                Preparo em{" "}
                <strong className="font-bold text-coffee">
                  {formatWeekday(edition.prep_date)}, {formatDate(edition.prep_date)}
                </strong>
              </span>
            </div>
            <p className="text-sm text-coffee-soft">
              Prazo para encomendar:{" "}
              <strong className="font-semibold text-coffee">
                {formatDateTime(edition.order_deadline)}
              </strong>
            </p>
          </div>
        </div>

        {(deliveryWindows.length > 0 || pickupWindows.length > 0) && (
          <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-white/60 px-3.5 py-3 text-sm lg:flex-row lg:gap-6">
            {deliveryWindows.length > 0 && (
              <p className="text-coffee-soft">
                <span className="font-semibold text-coffee">Entrega:</span>{" "}
                {deliveryWindows.map((w) => w.label).join(" · ")}
              </p>
            )}
            {pickupWindows.length > 0 && (
              <p className="text-coffee-soft">
                <span className="font-semibold text-coffee">Retirada:</span>{" "}
                {pickupWindows.map((w) => w.label).join(" · ")}
              </p>
            )}
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-coffee-soft/80">
          Os burgers são preparados na data acima — não é uma entrega imediata.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3.5 px-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 lg:px-8">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            qty={getQty(product.id)}
            disabled={!orderingEnabled}
            onOpen={() => handleOpenProduct(product)}
          />
        ))}
      </section>

      {!orderingEnabled && (
        <div className="mx-5 mt-5 rounded-2xl bg-white px-4 py-3.5 text-sm text-coffee-soft lg:mx-8">
          As encomendas desta edição não estão mais abertas. Fique de olho para a próxima.
        </div>
      )}

      {edition.is_demo && (
        <div className="mx-5 mt-5 rounded-2xl border border-dashed border-orange/40 bg-orange-soft/40 px-4 py-3 text-xs font-medium text-orange-dark lg:mx-8">
          Edição de demonstração — nenhum pedido real é processado aqui.
        </div>
      )}

      <SocialFooter />

      <ProductSheet
        key={activeProduct?.id ?? "none"}
        product={orderingEnabled ? activeProduct : null}
        lines={activeProduct ? getLinesForProduct(activeProduct.id) : []}
        onClose={() => setActiveProduct(null)}
        onAddLine={(qty, doneness, note) => {
          if (!activeProduct) return;
          upsertLine(
            null,
            { id: activeProduct.id, name: activeProduct.name, priceCents: activeProduct.price_cents },
            qty,
            { doneness, note }
          );
        }}
        onUpdateLineQty={updateLineQty}
        onRemoveLine={removeLine}
      />

      <CartBar />
    </div>
  );
}
