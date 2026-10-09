"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useDialog } from "@/lib/dialog-context";
import { useSwipeBack } from "@/lib/useSwipeBack";
import { createClient } from "@/lib/supabase/client";
import { silentlyLinkExistingSubscription } from "@/lib/push";
import { formatCents, formatDate, formatWeekday } from "@/lib/format";
import { fbTrack } from "@/lib/fbpixel";
import { gtagEvent } from "@/lib/gtag";
import { QtyStepper } from "./QtyStepper";
import type {
  DeliveryWindow,
  Edition,
  FulfillmentType,
  Neighborhood,
  PaymentMethod,
  Product,
} from "@/lib/types";

const ERROR_MESSAGES: Record<string, string> = {
  EDITION_CLOSED: "Esta edição não está mais aceitando encomendas.",
  NOT_OPEN_YET: "As encomendas desta edição ainda não abriram.",
  DEADLINE_PASSED: "O prazo para encomendar nesta edição já passou.",
  WINDOW_INVALID: "A janela escolhida não está mais disponível. Escolha outra.",
  WINDOW_TYPE_MISMATCH: "Escolha uma janela compatível com entrega ou retirada.",
  WINDOW_FULL: "Essa janela de horário ficou lotada. Escolha outro horário.",
  ADDRESS_REQUIRED: "Informe o endereço completo para entrega.",
  NEIGHBORHOOD_INVALID: "Escolha um bairro atendido.",
  INVALID_QTY: "Quantidade inválida no carrinho.",
  EMPTY_CART: "Seu carrinho está vazio.",
  PAYMENT_METHOD_UNAVAILABLE: "Essa forma de pagamento não está disponível nesta edição.",
  INVALID_CASH_CHANGE: "O troco informado precisa ser maior ou igual ao total do pedido.",
  PICKUP_DISABLED: "Retirada não está disponível no momento — só entrega por enquanto.",
};

function friendlyError(message: string): string {
  const key = message.split(":")[0];
  if (key === "PRODUCT_INVALID") return "Um dos itens não está mais disponível nesta edição.";
  if (key === "OUT_OF_STOCK") {
    const flavor = message.split(":")[1];
    return `O sabor "${flavor}" não tem mais estoque suficiente. Ajuste a quantidade.`;
  }
  return ERROR_MESSAGES[key] ?? "Não foi possível confirmar sua encomenda. Tente novamente.";
}

export function CheckoutScreen({
  edition,
  products,
  windows,
  neighborhoods,
}: {
  edition: Edition;
  products: Product[];
  windows: DeliveryWindow[];
  neighborhoods: Neighborhood[];
}) {
  const { items, subtotalCents, clear, updateLineQty, removeLine } = useCart();
  const { confirmDialog } = useDialog();
  const router = useRouter();
  useSwipeBack(() => router.push("/"));
  const idempotencyKey = useRef(crypto.randomUUID());

  const pickupAvailable = edition.pickup_enabled && windows.some((w) => w.type === "pickup");

  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");
  const [windowId, setWindowId] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [cashChangeInput, setCashChangeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableWindows = windows.filter((w) => w.type === fulfillment);
  const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const feeKnown = fulfillment !== "delivery" || !!neighborhoodId || edition.free_delivery;
  const deliveryFeeCents =
    fulfillment === "delivery" && !edition.free_delivery ? neighborhood?.delivery_fee_cents ?? 0 : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (items.length === 0) return;
    fbTrack("InitiateCheckout", {
      value: subtotalCents / 100,
      currency: "BRL",
      num_items: items.reduce((sum, i) => sum + i.qty, 0),
    });
    gtagEvent("begin_checkout", {
      currency: "BRL",
      value: subtotalCents / 100,
      items: items.map((i) => ({ item_id: i.productId, item_name: i.name, quantity: i.qty })),
    });
  }, []);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.productId, (map.get(item.productId) ?? 0) + item.qty);
    return map;
  }, [items]);

  const groupedItems = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, { productId: string; name: string; lines: typeof items }>();
    for (const item of items) {
      if (!groups.has(item.productId)) {
        order.push(item.productId);
        groups.set(item.productId, { productId: item.productId, name: item.name, lines: [] });
      }
      groups.get(item.productId)!.lines.push(item);
    }
    return order.map((id) => groups.get(id)!);
  }, [items]);

  const cashChangeCents = cashChangeInput.trim() ? Math.round(Number(cashChangeInput) * 100) : null;
  const cashChangeInvalid =
    paymentMethod === "cash" && cashChangeCents !== null && cashChangeCents < totalCents;

  const isValid =
    items.length > 0 &&
    name.trim().length >= 2 &&
    whatsapp.replace(/\D/g, "").length >= 10 &&
    windowId &&
    !cashChangeInvalid &&
    (fulfillment === "pickup" || (street.trim() && number.trim() && neighborhoodId));

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("place_order", {
      p_edition_id: edition.id,
      p_idempotency_key: idempotencyKey.current,
      p_customer_name: name.trim(),
      p_whatsapp: whatsapp.trim(),
      p_fulfillment_type: fulfillment,
      p_address_street: fulfillment === "delivery" ? street.trim() : null,
      p_address_number: fulfillment === "delivery" ? number.trim() : null,
      p_address_complement: fulfillment === "delivery" ? complement.trim() || null : null,
      p_address_reference: fulfillment === "delivery" ? reference.trim() || null : null,
      p_neighborhood_id: fulfillment === "delivery" ? neighborhoodId : null,
      p_window_id: windowId,
      p_notes: notes.trim() || null,
      p_items: items.map((item) => ({
        product_id: item.productId,
        qty: item.qty,
        doneness: item.doneness ?? null,
        note: item.note ?? null,
      })),
      p_payment_method: paymentMethod,
      p_cash_change_for_cents: paymentMethod === "cash" ? cashChangeCents : null,
    });

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      setSubmitting(false);
      return;
    }

    const result = data as { public_token: string };
    fbTrack("Purchase", {
      value: totalCents / 100,
      currency: "BRL",
      content_type: "product",
      num_items: items.reduce((sum, i) => sum + i.qty, 0),
    });
    gtagEvent("purchase", {
      transaction_id: result.public_token,
      currency: "BRL",
      value: totalCents / 100,
      items: items.map((i) => ({ item_id: i.productId, item_name: i.name, quantity: i.qty })),
    });
    clear();
    silentlyLinkExistingSubscription(result.public_token);
    router.push(`/pedido/${result.public_token}`);
  }

  async function handleCancelOrder() {
    const ok = await confirmDialog({
      title: "Cancelar pedido?",
      message: "Sua sacola será esvaziada e você voltará para o cardápio.",
      confirmLabel: "Cancelar pedido",
      destructive: true,
    });
    if (!ok) return;
    clear();
    router.push("/");
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <h1 className="text-xl font-extrabold text-coffee">Seu carrinho está vazio</h1>
        <p className="mt-2 text-sm text-coffee-soft">Escolha seus burgers para continuar.</p>
        <Link
          href="/"
          className="mt-6 rounded-2xl bg-orange px-6 py-3 text-sm font-bold text-white"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  const buttonLabel = submitting
    ? "Enviando…"
    : !feeKnown
    ? "Selecione o bairro para continuar"
    : `Confirmar encomenda · ${formatCents(totalCents)}`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-40 lg:max-w-[1100px] lg:pb-16">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] lg:px-8 lg:pt-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-11 w-11 items-center justify-center text-xl text-coffee"
            aria-label="Voltar"
          >
            ←
          </Link>
          <h1 className="text-lg font-extrabold text-coffee lg:text-xl">Sua sacola</h1>
        </div>
        <button
          onClick={handleCancelOrder}
          className="flex h-11 items-center px-2 text-xs font-bold text-danger"
        >
          Cancelar pedido
        </button>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:px-8">
        <div className="flex flex-col gap-4 lg:gap-5">
          <section className="mx-5 mt-3 rounded-2xl bg-white p-4 lg:mx-0 lg:mt-0">
            <p className="text-sm font-semibold text-coffee">
              Preparo em {formatWeekday(edition.prep_date)}, {formatDate(edition.prep_date)}
            </p>
            <div className="mt-3 flex flex-col divide-y divide-cream-soft">
              {groupedItems.map((group) => {
                const product = productMap.get(group.productId);
                const totalForProduct = qtyByProduct.get(group.productId) ?? 0;
                const groupTotalCents = group.lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
                return (
                  <div key={group.productId} className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-bold text-coffee">
                        {group.name}
                        {group.lines.length > 1 && (
                          <span className="ml-1.5 font-normal text-coffee-soft">
                            · {totalForProduct} unidades
                          </span>
                        )}
                      </p>
                      <span className="shrink-0 font-semibold text-coffee">
                        {formatCents(groupTotalCents)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {group.lines.map((line) => {
                        const maxQty = product
                          ? Math.max(line.qty, product.available_qty - (totalForProduct - line.qty))
                          : line.qty;
                        return (
                          <div
                            key={line.lineId}
                            className={`flex flex-col gap-1.5 ${
                              group.lines.length > 1
                                ? "rounded-xl border border-orange/15 bg-orange-soft/25 p-2.5"
                                : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-coffee">
                                {line.qty}× {line.doneness ?? "Ponto da casa"}
                              </p>
                              <span className="shrink-0 text-sm font-semibold text-coffee-soft">
                                {formatCents(line.priceCents * line.qty)}
                              </span>
                            </div>
                            {line.note && (
                              <p className="text-xs italic text-coffee-soft">
                                &ldquo;{line.note}&rdquo; — vale para{" "}
                                {line.qty === 1 ? "essa unidade" : `as ${line.qty} unidades acima`}
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <QtyStepper
                                qty={line.qty}
                                max={maxQty}
                                onChange={(qty) => updateLineQty(line.lineId, qty)}
                              />
                              <button
                                onClick={() => removeLine(line.lineId)}
                                className="flex h-11 items-center px-2 text-xs font-bold text-danger"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <Link href="/" className="mt-3 inline-block text-xs font-semibold text-orange">
              + Adicionar mais itens
            </Link>
            {products.some((p) => items.some((i) => i.productId === p.id) && p.available_qty === 0) && (
              <p className="mt-2 text-xs font-semibold text-danger">
                Um item do seu carrinho ficou indisponível. Edite o pedido antes de continuar.
              </p>
            )}
          </section>

          <section className="mx-5 flex flex-col gap-4 rounded-2xl bg-white p-4 lg:mx-0">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-coffee-soft">
              Seus dados
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field label="Nome">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="input"
                />
              </Field>
              <Field label="WhatsApp (com DDD)">
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 91234-5678"
                  inputMode="tel"
                  className="input"
                />
              </Field>
            </div>
          </section>

          <section className="mx-5 flex flex-col gap-4 rounded-2xl bg-white p-4 lg:mx-0">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-coffee-soft">
              {pickupAvailable ? "Entrega ou retirada" : "Entrega"}
            </h2>

            {pickupAvailable && (
              <div className="flex gap-2">
                <ToggleButton
                  active={fulfillment === "delivery"}
                  onClick={() => {
                    setFulfillment("delivery");
                    setWindowId("");
                  }}
                >
                  Entrega
                </ToggleButton>
                <ToggleButton
                  active={fulfillment === "pickup"}
                  onClick={() => {
                    setFulfillment("pickup");
                    setWindowId("");
                  }}
                >
                  Retirada
                </ToggleButton>
              </div>
            )}

            <Field label="Janela de horário">
              <select value={windowId} onChange={(e) => setWindowId(e.target.value)} className="input">
                <option value="">Selecione um horário</option>
                {availableWindows.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.reserved_burgers >= w.capacity_burgers}>
                    {w.label}
                    {w.reserved_burgers >= w.capacity_burgers ? " (lotado)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <p className="-mt-2 text-xs text-coffee-soft">
              Sua {fulfillment === "delivery" ? "entrega" : "retirada"} será realizada dentro do
              horário escolhido.
            </p>

            {fulfillment === "pickup" && edition.pickup_address && (
              <div className="rounded-xl bg-cream-soft px-3.5 py-3 text-sm text-coffee">
                <span className="font-semibold">Local de retirada:</span> {edition.pickup_address}
              </div>
            )}

            {fulfillment === "delivery" && (
              <>
                <Field label="Bairro / região">
                  <select
                    value={neighborhoodId}
                    onChange={(e) => setNeighborhoodId(e.target.value)}
                    className="input"
                  >
                    <option value="">Selecione seu bairro</option>
                    {neighborhoods.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                        {!edition.free_delivery && ` — ${formatCents(n.delivery_fee_cents)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Rua" className="col-span-2">
                    <input value={street} onChange={(e) => setStreet(e.target.value)} className="input" />
                  </Field>
                  <Field label="Número">
                    <input value={number} onChange={(e) => setNumber(e.target.value)} className="input" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Field label="Complemento (opcional)">
                    <input
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Ponto de referência (opcional)">
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="input"
                    />
                  </Field>
                </div>
              </>
            )}
          </section>

          <section className="mx-5 flex flex-col gap-4 rounded-2xl bg-white p-4 lg:mx-0">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-coffee-soft">
              Forma de pagamento
            </h2>
            <div className="flex flex-wrap gap-2">
              <ToggleButton active={paymentMethod === "pix"} onClick={() => setPaymentMethod("pix")}>
                Pix
              </ToggleButton>
              {edition.accepts_card_on_delivery && (
                <ToggleButton active={paymentMethod === "card"} onClick={() => setPaymentMethod("card")}>
                  Cartão na entrega
                </ToggleButton>
              )}
              {edition.accepts_cash_on_delivery && (
                <ToggleButton active={paymentMethod === "cash"} onClick={() => setPaymentMethod("cash")}>
                  Dinheiro
                </ToggleButton>
              )}
            </div>
            {paymentMethod === "pix" && (
              <p className="text-xs leading-relaxed text-coffee-soft">
                Você vai receber a chave Pix, QR Code e código para copiar e colar depois de
                confirmar.
              </p>
            )}
            {paymentMethod === "card" && (
              <p className="text-xs leading-relaxed text-coffee-soft">
                Leve o cartão de débito ou crédito — a maquininha estará na entrega/retirada.
              </p>
            )}
            {paymentMethod === "cash" && (
              <Field label="Vai pagar com quanto? (opcional)">
                <input
                  type="number"
                  step="0.01"
                  min={totalCents / 100}
                  value={cashChangeInput}
                  onChange={(e) => setCashChangeInput(e.target.value)}
                  placeholder={`Ex: ${(totalCents / 100 + 10).toFixed(2)}`}
                  className="input"
                />
                {cashChangeInvalid ? (
                  <span className="text-xs font-semibold text-danger">
                    O valor precisa ser maior ou igual ao total ({formatCents(totalCents)}).
                  </span>
                ) : cashChangeCents !== null ? (
                  <span className="text-sm font-bold text-success">
                    Troco: {formatCents(cashChangeCents - totalCents)}
                  </span>
                ) : (
                  <span className="text-xs text-coffee-soft">
                    Deixe em branco se for pagar com o valor exato.
                  </span>
                )}
              </Field>
            )}
          </section>

          <section className="mx-5 rounded-2xl bg-white p-4 lg:mx-0">
            <Field label="Observações (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input resize-none"
                placeholder="Ex: prefiro que chegue mais perto das 18h, sem cebola, etc."
              />
              <span className="text-xs leading-snug text-coffee-soft">
                Quer a entrega mais perto do início ou do fim da janela escolhida? Escreva aqui —
                a gente tenta encaixar.
              </span>
            </Field>
          </section>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:sticky lg:top-6 lg:mt-0">
          <section className="mx-5 flex flex-col gap-2 rounded-2xl bg-white p-4 lg:mx-0">
            <h2 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-coffee-soft">
              Resumo
            </h2>
            <SummaryRow label="Subtotal" value={formatCents(subtotalCents)} />
            {fulfillment === "delivery" && (
              <SummaryRow
                label="Taxa de entrega"
                value={
                  edition.free_delivery
                    ? "Grátis"
                    : feeKnown
                      ? formatCents(deliveryFeeCents)
                      : "A calcular"
                }
                muted={!feeKnown}
              />
            )}
            <div className="my-1 h-px bg-cream-soft" />
            <SummaryRow
              label="Total"
              value={feeKnown ? formatCents(totalCents) : "A calcular"}
              bold
            />
            {!feeKnown && (
              <p className="text-xs font-medium text-orange-dark">
                Selecione seu bairro para calcular a entrega.
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-coffee-soft/80">
              Usamos seus dados apenas para preparar e entregar esta encomenda. Nada é
              compartilhado com terceiros.
            </p>
          </section>

          {error && (
            <div className="mx-5 rounded-2xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger lg:mx-0">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="mx-5 hidden rounded-2xl bg-orange py-4 text-center text-base font-bold text-white shadow-lg shadow-orange/20 transition active:scale-[0.98] disabled:opacity-40 lg:mx-0 lg:block"
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-cream/95 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 backdrop-blur lg:hidden">
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="mx-auto block w-full max-w-lg rounded-2xl bg-orange py-4 text-center text-base font-bold text-white shadow-lg shadow-orange/20 transition active:scale-[0.98] disabled:opacity-40"
        >
          {buttonLabel}
        </button>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 14px;
          background: var(--color-cream-soft);
          padding: 12px 14px;
          font-size: 16px;
          color: var(--color-coffee);
        }
        .input:focus {
          outline: 2px solid var(--color-orange);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-coffee-soft">{label}</span>
      {children}
    </label>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl py-3 text-sm font-bold transition ${
        active ? "bg-orange text-white" : "bg-cream-soft text-coffee-soft"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-bold text-coffee" : "text-coffee-soft"}>{label}</span>
      <span
        className={
          bold
            ? "text-base font-extrabold text-coffee"
            : muted
            ? "font-semibold italic text-coffee-soft/70"
            : "font-semibold text-coffee"
        }
      >
        {value}
      </span>
    </div>
  );
}
