"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import { formatCents } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductsManager({
  editionId,
  products,
  onChange,
  perProductStats,
}: {
  editionId: string;
  products: Product[];
  onChange: (products: Product[]) => void;
  perProductStats: Map<string, { reserved: number; confirmed: number }>;
}) {
  async function addProduct() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .insert({
        edition_id: editionId,
        name: "Novo sabor",
        description: "",
        price_cents: 0,
        stock_qty: 0,
        available_qty: 0,
        sort_order: products.length,
      })
      .select("*")
      .single();
    if (!error && data) onChange([...products, data as Product]);
  }

  const { confirmDialog, alertDialog } = useDialog();

  function updateLocal(id: string, patch: Partial<Product>) {
    onChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function handleDelete(product: Product) {
    const ok = await confirmDialog({
      title: `Excluir "${product.name}"?`,
      message: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      if (error.code === "23503") {
        await alertDialog({
          title: "Não é possível excluir",
          message: `"${product.name}" já tem pedidos associados. Desative-o (desmarque "Ativo") para tirá-lo do cardápio sem apagar o histórico.`,
          tone: "danger",
        });
      } else {
        await alertDialog({
          title: "Não foi possível excluir",
          message: "Tente novamente em instantes.",
          tone: "danger",
        });
      }
      return;
    }
    onChange(products.filter((p) => p.id !== product.id));
  }

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">Sabores</h2>
        <button onClick={addProduct} className="text-sm font-bold text-orange">
          + Adicionar sabor
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            stats={perProductStats.get(product.id)}
            onUpdate={(patch) => updateLocal(product.id, patch)}
            onDelete={() => handleDelete(product)}
          />
        ))}
        {products.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhum sabor cadastrado ainda.</p>
        )}
      </div>
    </section>
  );
}

function ProductRow({
  product,
  stats,
  onUpdate,
  onDelete,
}: {
  product: Product;
  stats?: { reserved: number; confirmed: number };
  onUpdate: (patch: Partial<Product>) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const committed = product.stock_qty - product.available_qty;
  const { alertDialog } = useDialog();

  async function save(patch: Partial<Product>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", product.id)
      .select("*")
      .single();
    if (!error && data) onUpdate(data as Product);
  }

  async function handleStockChange(newStock: number) {
    if (newStock < committed) {
      await alertDialog({
        title: "Quantidade inválida",
        message: `Não é possível reduzir o estoque abaixo do que já está comprometido (${committed}).`,
        tone: "danger",
      });
      return;
    }
    const newAvailable = newStock - committed;
    await save({ stock_qty: newStock, available_qty: newAvailable });
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${product.edition_id}/${product.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file, { upsert: true });
    if (!uploadError) {
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      await save({ image_url: data.publicUrl });
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-cream-soft p-3 sm:flex-row">
      <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-white sm:w-32">
        {product.image_url && (
          <Image src={product.image_url} alt={product.name} fill className="object-cover" />
        )}
        <button
          onClick={() => fileInput.current?.click()}
          className="absolute inset-0 flex items-center justify-center bg-coffee/0 text-xs font-bold text-transparent hover:bg-coffee/40 hover:text-white"
        >
          {uploading ? "Enviando…" : "Trocar foto"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={product.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            onBlur={(e) => save({ name: e.target.value })}
            placeholder="Nome"
            className="rounded-lg bg-white px-3 py-2 text-sm font-bold"
            style={{ fontSize: 16 }}
          />
          <input
            type="number"
            step="0.01"
            value={(product.price_cents / 100).toFixed(2)}
            onChange={(e) => onUpdate({ price_cents: Math.round(Number(e.target.value) * 100) })}
            onBlur={(e) => save({ price_cents: Math.round(Number(e.target.value) * 100) })}
            placeholder="Preço"
            className="rounded-lg bg-white px-3 py-2 text-sm"
            style={{ fontSize: 16 }}
          />
        </div>
        <textarea
          value={product.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          onBlur={(e) => save({ description: e.target.value })}
          rows={2}
          placeholder="Ingredientes"
          className="resize-none rounded-lg bg-white px-3 py-2 text-sm"
          style={{ fontSize: 16 }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            Estoque total
            <input
              type="number"
              min={committed}
              defaultValue={product.stock_qty}
              onBlur={(e) => handleStockChange(Number(e.target.value))}
              className="w-20 rounded-lg bg-white px-2 py-1.5 text-sm"
              style={{ fontSize: 16 }}
            />
          </label>
          <span className="text-xs text-coffee-soft">
            Disponível: <strong>{product.available_qty}</strong>
          </span>
          {stats && (
            <span className="text-xs text-coffee-soft">
              Reservado/confirmado: <strong>{stats.reserved}</strong> · Confirmado:{" "}
              <strong>{stats.confirmed}</strong>
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
            <input
              type="checkbox"
              checked={product.active}
              onChange={(e) => {
                onUpdate({ active: e.target.checked });
                save({ active: e.target.checked });
              }}
            />
            Ativo
          </label>
          <button
            onClick={onDelete}
            className="ml-auto rounded-lg bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger"
          >
            Excluir
          </button>
        </div>
        <p className="text-xs text-coffee-soft/70">Preço atual: {formatCents(product.price_cents)}</p>
      </div>
    </div>
  );
}
