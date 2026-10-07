"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Badge } from "./Badge";
import { ProductCard } from "./ProductCard";
import { ProductSheet } from "./ProductSheet";
import { CartBar } from "./CartBar";
import { SocialFooter } from "./SocialFooter";
import { useCart } from "@/lib/cart-context";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { ensurePushSubscription, isAndroid, isIOS, isPushSupported, isStandalone } from "@/lib/push";
import { formatDate, formatDateTime, formatWeekday } from "@/lib/format";
import {
  canOrder,
  getEditionSituation,
  SITUATION_LABEL,
  SITUATION_TONE,
} from "@/lib/edition-state";
import type { DeliveryWindow, Edition, Neighborhood, Product } from "@/lib/types";

export function EditionScreen({
  edition: initialEdition,
  initialProducts,
  windows,
  neighborhoods,
}: {
  edition: Edition;
  initialProducts: Product[];
  windows: DeliveryWindow[];
  neighborhoods: Neighborhood[];
}) {
  const [edition, setEditionData] = useState(initialEdition);
  const [products, setProducts] = useState(initialProducts);
  const [clockTick, setClockTick] = useState(0);
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [pushModal, setPushModal] = useState<"hidden" | "ask" | "ios-install">("hidden");
  const [pushBusy, setPushBusy] = useState(false);
  const { setEdition, getQty, getLinesForProduct, upsertLine, updateLineQty, removeLine } =
    useCart();
  const { alertDialog } = useDialog();

  useEffect(() => {
    setEdition(edition.id);
  }, [edition.id, setEdition]);

  useEffect(() => {
    if (isPushSupported() && Notification.permission === "default") {
      setPushModal("ask");
      return;
    }
    // On iPhone/iPad, Safari only exposes push to apps added to the Home Screen —
    // in a regular tab there's no permission to ask for, so we point customers
    // at that step instead (shown once, not on every visit).
    if (isIOS() && !isStandalone() && !localStorage.getItem("franks_ios_install_seen")) {
      setPushModal("ios-install");
    }
  }, []);

  useEffect(() => {
    if (pushModal === "hidden") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [pushModal]);

  async function handleAllowNotifications() {
    setPushBusy(true);
    try {
      await ensurePushSubscription();
    } catch {
      // denied or unsupported — nothing else to do, hide the prompt either way
    } finally {
      setPushBusy(false);
      setPushModal("hidden");
    }
  }

  function dismissIosInstall() {
    localStorage.setItem("franks_ios_install_seen", "1");
    setPushModal("hidden");
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`edition-${edition.id}-${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `edition_id=eq.${edition.id}` },
        (payload) => {
          setProducts((prev) =>
            prev.map((p) => (p.id === payload.new.id ? { ...p, ...(payload.new as Product) } : p))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "editions", filter: `id=eq.${edition.id}` },
        (payload) => {
          setEditionData((prev) => ({ ...prev, ...(payload.new as Edition) }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [edition.id]);

  // Abertura/fechamento agendados (opens_at / order_deadline) não disparam nenhuma
  // escrita no banco no instante exato — sem isso, quem já estivesse com a página
  // aberta só veria a mudança depois de um F5.
  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const situation = useMemo(
    () => getEditionSituation(edition, products),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edition, products, clockTick]
  );
  const orderingEnabled = canOrder(situation);

  const deliveryWindows = windows.filter((w) => w.type === "delivery");
  const pickupWindows = edition.pickup_enabled ? windows.filter((w) => w.type === "pickup") : [];

  const situationMessages: Record<string, string> = {
    sold_out: "Esta edição esgotou. Fique de olho para a próxima.",
    scheduled: edition.opens_at
      ? `As encomendas abrem em ${formatDateTime(edition.opens_at)}.`
      : "As encomendas ainda não abriram.",
    deadline_passed: "O prazo para encomendar nesta edição já passou.",
    closed_by_admin: "As encomendas desta edição não estão mais abertas. Fique de olho para a próxima.",
  };

  async function handleOpenProduct(product: Product) {
    if (orderingEnabled) {
      setActiveProduct(product);
      return;
    }
    await alertDialog({
      title: "Loja fechada no momento",
      message: situationMessages[situation] ?? "Não é possível fazer pedidos agora.",
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-32 lg:max-w-[1140px]">
      {pushModal !== "hidden" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div className="animate-fade-in absolute inset-0 bg-coffee/40 backdrop-blur-sm" aria-hidden />
          {pushModal === "ask" ? (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="push-prompt-title"
              className="animate-dialog-pop relative flex w-full max-w-[320px] flex-col items-center gap-2 overflow-hidden rounded-[22px] bg-cream px-6 pb-6 pt-7 text-center shadow-2xl"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-soft text-orange">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 id="push-prompt-title" className="mt-1 text-[17px] font-extrabold leading-tight text-coffee">
                Permitir notificações de pedidos
              </h2>
              <p className="text-[14px] leading-relaxed text-coffee-soft">
                {isAndroid()
                  ? "Toque em permitir para saber, direto no seu Android, assim que seu pedido for confirmado."
                  : "Quando o seu pedido for confirmado, você recebe um aviso direto no celular."}
              </p>
              <button
                onClick={handleAllowNotifications}
                disabled={pushBusy}
                className="mt-3 w-full rounded-xl bg-orange py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {pushBusy ? "Ativando…" : "Permitir notificações"}
              </button>
            </div>
          ) : (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ios-install-title"
              className="animate-dialog-pop relative flex w-full max-w-[320px] flex-col items-center gap-2 overflow-hidden rounded-[22px] bg-cream px-6 pb-6 pt-7 text-center shadow-2xl"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-soft text-orange">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    d="M12 16V4m0 0 4 4m-4-4-4 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 id="ios-install-title" className="mt-1 text-[17px] font-extrabold leading-tight text-coffee">
                Ative notificações de pedidos
              </h2>
              <p className="text-left text-[14px] leading-relaxed text-coffee-soft">
                No iPhone, o Safari só permite notificações para sites adicionados à Tela de
                Início. É rápido:
              </p>
              <ol className="w-full list-decimal space-y-1 pl-5 text-left text-[14px] leading-relaxed text-coffee-soft">
                <li>
                  Toque em <strong className="text-coffee">Compartilhar</strong> (o ícone com a
                  seta) na barra do Safari.
                </li>
                <li>
                  Escolha <strong className="text-coffee">Adicionar à Tela de Início</strong>.
                </li>
                <li>Abra o Franck&apos;s Burger por esse ícone e permita as notificações.</li>
              </ol>
              <button
                onClick={dismissIosInstall}
                className="mt-3 w-full rounded-xl bg-orange py-3 text-[15px] font-bold text-white"
              >
                Entendi
              </button>
            </div>
          )}
        </div>
      )}

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
            {situation === "scheduled" && edition.opens_at ? (
              <p className="text-sm text-coffee-soft">
                Abre em:{" "}
                <strong className="font-semibold text-coffee">
                  {formatDateTime(edition.opens_at)}
                </strong>
              </p>
            ) : (
              <p className="text-sm text-coffee-soft">
                Prazo para encomendar:{" "}
                <strong className="font-semibold text-coffee">
                  {formatDateTime(edition.order_deadline)}
                </strong>
              </p>
            )}
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

      {!orderingEnabled && (situation === "closed_by_admin" || situation === "deadline_passed") ? (
        <div className="mx-5 mt-5 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-7 text-center lg:mx-8">
          <span className="text-3xl">🎉</span>
          <h2 className="text-lg font-extrabold leading-tight text-coffee">
            Essa edição foi um sucesso — os pedidos encerraram!
          </h2>
          <p className="text-sm leading-relaxed text-coffee-soft">
            Muito obrigado a todos que encomendaram! Agora é só aguardar a próxima edição.
          </p>
          <p className="text-sm leading-relaxed text-coffee-soft">
            Enquanto isso, entra no nosso grupo do WhatsApp (o botão é aqui embaixo ⬇️): é lá que
            eu posto a produção dos burgers, o pessoal manda foto do pedido e dá seu feedback de
            verdade — e você fica sabendo na hora assim que a próxima edição abrir.
          </p>
          <svg
            className="nudge-arrow mt-1 text-success"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="M12 4v16M12 20l-6-6M12 20l6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        !orderingEnabled && (
          <div className="mx-5 mt-5 rounded-2xl bg-white px-4 py-3.5 text-sm text-coffee-soft lg:mx-8">
            {situationMessages[situation] ?? "Não é possível fazer pedidos agora."}
          </div>
        )
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
