"use client";

import Link from "next/link";
import { formatCents } from "@/lib/format";
import { useCart } from "@/lib/cart-context";

export function CartBar() {
  const { totalQty, subtotalCents } = useCart();

  if (totalQty === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
      <Link
        href="/finalizar"
        className="mx-auto flex max-w-lg items-center justify-between rounded-2xl bg-coffee px-5 py-4 text-cream shadow-2xl shadow-coffee/30 transition active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-orange px-1.5 text-xs font-bold text-white">
            {totalQty}
          </span>
          {totalQty === 1 ? "burger" : "burgers"}
        </span>
        <span className="text-base font-bold">{formatCents(subtotalCents)}</span>
        <span className="text-sm font-bold text-orange-soft">Ver pedido →</span>
      </Link>
    </div>
  );
}
