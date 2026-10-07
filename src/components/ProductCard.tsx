"use client";

import Image from "next/image";
import { formatCents } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  qty,
  disabled,
  onOpen,
}: {
  product: Product;
  qty: number;
  disabled: boolean;
  onOpen: () => void;
}) {
  const soldOut = product.available_qty <= 0;
  const lowStock = product.available_qty > 0 && product.available_qty <= 5;

  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-3xl bg-white text-left shadow-[0_1px_2px_rgba(44,24,16,0.06),0_8px_24px_rgba(44,24,16,0.06)] transition active:scale-[0.98]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream-soft">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 320px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlaceholderBurger />
          </div>
        )}
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-coffee/55">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-coffee">
              Esgotado
            </span>
          </div>
        )}
        {qty > 0 && !soldOut && (
          <div className="absolute right-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-orange px-2 text-sm font-bold text-white shadow">
            {qty}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-base font-bold leading-tight text-coffee">
            {product.name}
          </h3>
          <span className="shrink-0 text-base font-extrabold text-orange">
            {formatCents(product.price_cents)}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-snug text-coffee-soft lg:line-clamp-3">
          {product.description}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {!soldOut && !disabled && lowStock ? (
            <span className="text-xs font-bold text-danger">
              Só {product.available_qty} restantes
            </span>
          ) : (
            <span />
          )}
          {!soldOut && !disabled && (
            <span className="inline-flex h-8 items-center rounded-full bg-orange-soft px-3 text-xs font-bold text-orange-dark">
              Escolher
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function PlaceholderBurger() {
  return (
    <svg viewBox="0 0 120 90" className="h-16 w-20 text-orange-soft" fill="none">
      <ellipse cx="60" cy="20" rx="42" ry="16" fill="currentColor" />
      <rect x="18" y="34" width="84" height="12" rx="6" fill="currentColor" />
      <rect x="18" y="50" width="84" height="12" rx="6" fill="currentColor" />
      <ellipse cx="60" cy="76" rx="42" ry="12" fill="currentColor" />
    </svg>
  );
}
