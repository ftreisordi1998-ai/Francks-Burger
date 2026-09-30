"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { PlaceholderBurger } from "./ProductCard";
import { QtyStepper } from "./QtyStepper";
import { formatCents } from "@/lib/format";
import { DEFAULT_DONENESS, DONENESS_OPTIONS } from "@/lib/doneness";
import type { CartItem, Product } from "@/lib/types";

export function ProductSheet({
  product,
  lines,
  onClose,
  onAddLine,
  onUpdateLineQty,
  onRemoveLine,
}: {
  product: Product | null;
  lines: CartItem[];
  onClose: () => void;
  onAddLine: (qty: number, doneness: string, note: string) => void;
  onUpdateLineQty: (lineId: string, qty: number) => void;
  onRemoveLine: (lineId: string) => void;
}) {
  const [doneness, setDoneness] = useState(DEFAULT_DONENESS);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  if (!product) return null;

  const inCartQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const remaining = Math.max(0, product.available_qty - inCartQty);

  function handleAdd() {
    if (qty <= 0 || !product || justAdded) return;
    onAddLine(qty, doneness, note.trim());
    setQty(1);
    setNote("");
    setDoneness(DEFAULT_DONENESS);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1100);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const footer = (
    <div className="flex flex-col gap-2">
      {remaining > 0 && (
        <button
          onClick={handleAdd}
          disabled={justAdded}
          className={`w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition active:scale-[0.98] ${
            justAdded ? "bg-success shadow-success/20" : "bg-orange shadow-orange/20"
          }`}
        >
          {justAdded
            ? "Adicionado ✓"
            : `Adicionar à sacola · ${formatCents(product.price_cents * qty)}`}
        </button>
      )}
      <button
        onClick={onClose}
        className="w-full rounded-2xl py-3.5 text-base font-bold text-coffee"
      >
        Concluído
      </button>
    </div>
  );

  return (
    <BottomSheet open={!!product} onClose={onClose} footer={footer}>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-cream-soft">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlaceholderBurger />
          </div>
        )}
      </div>
      <div className="px-5 pb-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-extrabold leading-tight text-coffee">{product.name}</h2>
          <span className="shrink-0 pt-1 text-xl font-extrabold text-orange">
            {formatCents(product.price_cents)}
          </span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-coffee-soft">{product.description}</p>

        {product.available_qty <= 0 ? (
          <div className="mt-6 rounded-2xl bg-danger-bg px-4 py-3 text-center text-sm font-semibold text-danger">
            Esgotado nesta edição
          </div>
        ) : (
          <>
            {lines.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                <span className="text-sm font-semibold text-coffee">Na sua sacola</span>
                {lines.map((line) => (
                  <div
                    key={line.lineId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-cream-soft px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-coffee">{line.doneness}</p>
                      {line.note && (
                        <p className="truncate text-xs italic text-coffee-soft">
                          &ldquo;{line.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <QtyStepper
                        qty={line.qty}
                        max={product.available_qty - (inCartQty - line.qty)}
                        onChange={(q) => onUpdateLineQty(line.lineId, q)}
                      />
                      <button
                        onClick={() => onRemoveLine(line.lineId)}
                        aria-label="Remover"
                        className="text-xs font-bold text-danger"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0 ? (
              <div
                ref={composerRef}
                className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-coffee/15 p-4"
              >
                <span className="text-sm font-semibold text-coffee">
                  {lines.length > 0 ? "Adicionar outra combinação" : "Ponto do hambúrguer"}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {DONENESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDoneness(opt.value)}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                        doneness === opt.value
                          ? "border-orange bg-orange-soft"
                          : "border-coffee/10 bg-cream-soft"
                      }`}
                    >
                      <span
                        className={`block text-sm font-bold ${
                          doneness === opt.value ? "text-orange-dark" : "text-coffee"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-coffee-soft">
                        {opt.description}
                      </span>
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-coffee">
                    Observação <span className="font-normal text-coffee-soft">(opcional)</span>
                  </span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex: sem maionese caseira"
                    className="rounded-xl bg-cream-soft px-3.5 py-2.5 text-coffee outline-none focus:ring-2 focus:ring-orange"
                    style={{ fontSize: 16 }}
                  />
                </label>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-coffee">Quantidade</span>
                  <QtyStepper qty={qty} max={remaining} onChange={setQty} />
                </div>
              </div>
            ) : (
              <p className="mt-5 text-center text-xs font-medium text-coffee-soft">
                Você já colocou todas as unidades disponíveis deste sabor na sacola.
              </p>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
