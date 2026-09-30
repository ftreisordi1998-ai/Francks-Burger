"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartItem } from "./types";

const STORAGE_KEY = "francksburger.cart.v2";

interface ProductRef {
  id: string;
  name: string;
  priceCents: number;
}

interface Customization {
  doneness?: string;
  note?: string;
}

interface CartContextValue {
  items: CartItem[];
  editionId: string | null;
  totalQty: number;
  subtotalCents: number;
  setEdition: (editionId: string) => void;
  /** Creates a new cart line (or updates an existing one when lineId is given). qty=0 removes it. */
  upsertLine: (
    lineId: string | null,
    product: ProductRef,
    qty: number,
    customization?: Customization
  ) => void;
  updateLineQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  getQty: (productId: string) => number;
  getLinesForProduct: (productId: string) => CartItem[];
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function makeLineId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const loaded: CartItem[] = (parsed.items ?? []).map((item: CartItem) => ({
          ...item,
          lineId: item.lineId ?? makeLineId(),
        }));
        setItems(loaded);
        setEditionId(parsed.editionId ?? null);
      }
    } catch {
      // ignore corrupted local storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, editionId }));
    } catch {
      // storage unavailable (private mode) — cart just won't persist
    }
  }, [items, editionId, hydrated]);

  const setEdition = useCallback((id: string) => {
    setEditionId((prev) => {
      if (prev && prev !== id) {
        setItems([]);
      }
      return id;
    });
  }, []);

  const upsertLine = useCallback(
    (lineId: string | null, product: ProductRef, qty: number, customization?: Customization) => {
      setItems((prev) => {
        const withoutLine = lineId ? prev.filter((item) => item.lineId !== lineId) : prev;
        if (qty <= 0) return withoutLine;
        return [
          ...withoutLine,
          {
            lineId: lineId ?? makeLineId(),
            productId: product.id,
            name: product.name,
            priceCents: product.priceCents,
            qty,
            doneness: customization?.doneness,
            note: customization?.note,
          },
        ];
      });
    },
    []
  );

  const updateLineQty = useCallback((lineId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((item) => item.lineId !== lineId);
      return prev.map((item) => (item.lineId === lineId ? { ...item, qty } : item));
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((item) => item.lineId !== lineId));
  }, []);

  const getQty = useCallback(
    (productId: string) =>
      items.filter((item) => item.productId === productId).reduce((sum, i) => sum + i.qty, 0),
    [items]
  );

  const getLinesForProduct = useCallback(
    (productId: string) => items.filter((item) => item.productId === productId),
    [items]
  );

  const clear = useCallback(() => setItems([]), []);

  const totalQty = useMemo(() => items.reduce((sum, item) => sum + item.qty, 0), [items]);
  const subtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.priceCents, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      editionId,
      totalQty,
      subtotalCents,
      setEdition,
      upsertLine,
      updateLineQty,
      removeLine,
      getQty,
      getLinesForProduct,
      clear,
    }),
    [
      items,
      editionId,
      totalQty,
      subtotalCents,
      setEdition,
      upsertLine,
      updateLineQty,
      removeLine,
      getQty,
      getLinesForProduct,
      clear,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
