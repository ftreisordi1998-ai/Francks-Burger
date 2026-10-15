"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCents, formatDateTime } from "@/lib/format";
import { fbTrack } from "@/lib/fbpixel";
import { gtagEvent } from "@/lib/gtag";
import type { OrderPaymentState, PaymentAttemptView } from "@/lib/types";

// Pagamento online (Mercado Pago) dentro da tela do pedido.
//  - Pix: a cobrança é criada no NOSSO servidor; aqui só mostramos QR, copia e
//    cola e o vencimento real que a API devolveu.
//  - Cartão: formulário oficial (Card Payment Brick) tokeniza o cartão no
//    navegador; o token vai para o nosso servidor, que cria a cobrança.
// Em nenhum caso o navegador manda valor: ele sai do pedido, no banco.

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => {
      bricks: () => {
        create: (
          type: "cardPayment",
          containerId: string,
          settings: Record<string, unknown>
        ) => Promise<{ unmount: () => void }>;
      };
    };
  }
}

const SDK_SRC = "https://sdk.mercadopago.com/js/v2";
const POLL_MS = 5000;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "";

type Method = "pix" | "credit_card";
type Phase = "choose" | "pix" | "card" | "approved" | "resolution";

const CARD_REJECTION_MESSAGES: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
  cc_rejected_bad_filled_date: "Confira a data de validade.",
  cc_rejected_bad_filled_security_code: "Confira o código de segurança.",
  cc_rejected_bad_filled_other: "Confira os dados do cartão.",
  cc_rejected_insufficient_amount: "O cartão não tem limite suficiente.",
  cc_rejected_call_for_authorize: "Você precisa autorizar o pagamento com o banco emissor.",
  cc_rejected_card_disabled: "Cartão desabilitado. Ligue para o banco para ativar.",
  cc_rejected_duplicated_payment: "Você já fez um pagamento com esse valor. Se precisar pagar de novo, use outro cartão.",
  cc_rejected_high_risk: "Pagamento recusado pela análise de risco. Tente outro cartão ou pague por Pix.",
  cc_rejected_max_attempts: "Limite de tentativas atingido. Tente outro cartão ou pague por Pix.",
  cc_rejected_blacklist: "Pagamento recusado. Tente outro cartão ou pague por Pix.",
  cc_rejected_3ds_mandatory: "O banco exige autenticação adicional que não foi concluída.",
};

function rejectionMessage(detail: string | null | undefined): string {
  if (!detail) return "Pagamento recusado. Tente outro cartão ou pague por Pix.";
  return CARD_REJECTION_MESSAGES[detail] ?? "Pagamento recusado. Tente outro cartão ou pague por Pix.";
}

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SDK_LOAD_FAILED")));
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("SDK_LOAD_FAILED"));
    document.head.appendChild(s);
  });
}

function useCountdown(targetIso: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!targetIso) {
      setLeft(null);
      return;
    }
    const target = new Date(targetIso).getTime();
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return left;
}

function fmtLeft(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function OnlinePayment({
  publicToken,
  orderId,
  totalCents,
  customerName,
  orderDeadline,
  initialPaymentStatus,
  onPaid,
}: {
  publicToken: string;
  orderId: string;
  totalCents: number;
  customerName: string;
  orderDeadline: string;
  initialPaymentStatus: string;
  onPaid?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(initialPaymentStatus === "paid" ? "approved" : "choose");
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState<PaymentAttemptView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const brickRef = useRef<{ unmount: () => void } | null>(null);
  const purchaseFiredRef = useRef(false);

  const deadlinePassed = useMemo(() => new Date(orderDeadline).getTime() <= Date.now(), [orderDeadline]);
  const countdown = useCountdown(attempt?.method === "pix" ? attempt.date_of_expiration : null);
  const pixExpired = attempt?.method === "pix" && countdown === 0;

  // Compra só conta depois da confirmação verificada pelo servidor — nunca ao
  // gerar o Pix nem ao abrir a página de sucesso. Deduplicada por pedido.
  const firePurchaseOnce = useCallback(() => {
    if (purchaseFiredRef.current) return;
    const key = `francksburger.purchase.${orderId}`;
    try {
      if (localStorage.getItem(key)) {
        purchaseFiredRef.current = true;
        return;
      }
      localStorage.setItem(key, "1");
    } catch {
      // sem storage: ainda assim só dispara uma vez por montagem
    }
    purchaseFiredRef.current = true;
    fbTrack("Purchase", { value: totalCents / 100, currency: "BRL", content_type: "product" }, orderId);
    gtagEvent("purchase", { transaction_id: orderId, currency: "BRL", value: totalCents / 100 });
  }, [orderId, totalCents]);

  const applyState = useCallback(
    (state: OrderPaymentState) => {
      if (state.attempt) setAttempt(state.attempt);
      if (state.payment_status === "paid") {
        if (state.payment_resolution_required) {
          setPhase("resolution");
        } else {
          setPhase("approved");
          firePurchaseOnce();
          onPaid?.();
        }
      }
    },
    [firePurchaseOnce, onPaid]
  );

  // Ao abrir/recarregar: recupera a tentativa válida existente em vez de
  // gerar outra cobrança.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/payments/status?token=${encodeURIComponent(publicToken)}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const state = (await res.json()) as OrderPaymentState;
      if (cancelled) return;
      applyState(state);
      const a = state.attempt;
      if (state.payment_status !== "paid" && a) {
        if (a.method === "pix" && a.status === "pending") setPhase("pix");
        else if (a.method === "credit_card" && (a.status === "in_process" || a.status === "authorized")) setPhase("card");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicToken, applyState]);

  // Enquanto houver cobrança aberta, consulta o NOSSO backend (não o provedor).
  const shouldPoll =
    phase !== "approved" &&
    phase !== "resolution" &&
    !!attempt &&
    ["pending", "in_process", "authorized", "in_mediation"].includes(attempt.status);
  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status?token=${encodeURIComponent(publicToken)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        applyState((await res.json()) as OrderPaymentState);
      } catch {
        // falha de rede momentânea: a próxima rodada tenta de novo
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [shouldPoll, publicToken, applyState]);

  async function createPayment(method: Method, card?: Record<string, unknown>, payer?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: publicToken,
          method,
          payer: { email: email.trim(), first_name: customerName.split(" ")[0], ...(payer ?? {}) },
          ...(card ? { card } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        attempt?: PaymentAttemptView;
        order_confirmed?: boolean;
        resolution_required?: boolean;
      };
      if (!res.ok) {
        setError(friendlyCreateError(data.error, data.message));
        return null;
      }
      if (data.attempt) setAttempt(data.attempt);
      return data;
    } catch {
      setError("Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startPix() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Informe um e-mail válido — o Mercado Pago exige para gerar o Pix.");
      return;
    }
    const data = await createPayment("pix");
    if (data) setPhase("pix");
  }

  // ---------------- Cartão (Brick oficial) ----------------
  useEffect(() => {
    if (phase !== "card" || !PUBLIC_KEY) return;
    let disposed = false;
    setCardReady(false);
    (async () => {
      try {
        await loadSdk();
        if (disposed || !window.MercadoPago) return;
        const mp = new window.MercadoPago(PUBLIC_KEY, { locale: "pt-BR" });
        const builder = mp.bricks();
        brickRef.current?.unmount();
        brickRef.current = await builder.create("cardPayment", "mp-card-brick", {
          initialization: { amount: totalCents / 100 },
          customization: {
            visual: { hidePaymentButton: false },
            // À vista: parcelamento fica fora desta versão.
            paymentMethods: { maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => {
              if (!disposed) setCardReady(true);
            },
            onError: () => {
              if (!disposed) setError("Não foi possível carregar o formulário do cartão. Tente de novo ou pague por Pix.");
            },
            onSubmit: async (formData: {
              token: string;
              payment_method_id: string;
              issuer_id?: string | number;
              payer?: { email?: string; identification?: { type: string; number: string } };
            }) => {
              if (formData.payer?.email) setEmail(formData.payer.email);
              const data = await createPayment(
                "credit_card",
                { token: formData.token, payment_method_id: formData.payment_method_id, issuer_id: formData.issuer_id },
                { email: formData.payer?.email ?? email, identification: formData.payer?.identification }
              );
              if (!data?.attempt) return;
              const a = data.attempt;
              if (a.status === "approved") {
                if (data.resolution_required) setPhase("resolution");
                else {
                  setPhase("approved");
                  firePurchaseOnce();
                  onPaid?.();
                }
              } else if (a.status === "rejected" || a.status === "cancelled") {
                setError(rejectionMessage(a.status_detail));
              }
              // in_process / authorized: fica na tela com polling, sem dizer "confirmado"
            },
          },
        });
      } catch {
        if (!disposed) setError("Não foi possível carregar o formulário do cartão. Tente de novo ou pague por Pix.");
      }
    })();
    return () => {
      disposed = true;
      brickRef.current?.unmount();
      brickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, totalCents]);

  async function copyPix() {
    if (!attempt?.qr_code) return;
    try {
      await navigator.clipboard.writeText(attempt.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código e copie.");
    }
  }

  // ======================= RENDER =======================
  if (phase === "approved") {
    return (
      <section className="mt-4 rounded-2xl bg-success-bg px-4 py-4">
        <h2 className="text-sm font-extrabold text-success">Pagamento aprovado</h2>
        <p className="mt-1 text-sm text-coffee">Sua encomenda está confirmada. Obrigado!</p>
      </section>
    );
  }

  if (phase === "resolution") {
    return (
      <section className="mt-4 rounded-2xl bg-warning-bg px-4 py-4">
        <h2 className="text-sm font-extrabold text-warning">Pagamento recebido</h2>
        <p className="mt-1 text-sm leading-relaxed text-coffee">
          Recebemos seu pagamento, mas a encomenda ainda não foi confirmada — a Franck&rsquo;s vai
          conferir e entrar em contato. Se precisar, fale com a gente pelo WhatsApp abaixo.
        </p>
      </section>
    );
  }

  if (deadlinePassed && phase === "choose") {
    return (
      <section className="mt-4 rounded-2xl bg-orange-soft px-4 py-4">
        <h2 className="text-sm font-extrabold text-orange-dark">Encomendas encerradas</h2>
        <p className="mt-1 text-sm text-coffee">
          O prazo para pagar esta encomenda terminou às {formatDateTime(orderDeadline)}.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl bg-orange-soft px-4 py-4">
      <h2 className="text-sm font-extrabold text-orange-dark">Pagamento online</h2>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-orange-dark/80">
        Pedido #{orderId.slice(0, 8).toUpperCase()} · {formatCents(totalCents)}
      </p>

      {phase === "choose" && (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-coffee-soft">
            Seu e-mail (para o comprovante)
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="voce@exemplo.com"
              style={{ fontSize: 16 }}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={startPix}
              disabled={busy}
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-orange text-sm font-extrabold text-white disabled:opacity-50"
            >
              {busy ? "Gerando Pix…" : "Pagar com Pix"}
            </button>
            <button
              onClick={() => {
                setError(null);
                setPhase("card");
              }}
              disabled={busy || !PUBLIC_KEY}
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white text-sm font-extrabold text-coffee ring-1 ring-coffee/15 disabled:opacity-50"
            >
              Pagar com cartão de crédito
            </button>
          </div>
          <p className="text-xs leading-relaxed text-coffee-soft">
            A confirmação é automática assim que o pagamento for aprovado — não precisa enviar
            comprovante.
          </p>
        </div>
      )}

      {phase === "pix" && attempt && (
        <div className="mt-3 flex flex-col items-center gap-3">
          {pixExpired ? (
            <>
              <p className="text-sm font-bold text-danger">Este Pix venceu.</p>
              {deadlinePassed ? (
                <p className="text-sm text-coffee">As encomendas já encerraram; não é possível gerar outro.</p>
              ) : (
                <button
                  onClick={startPix}
                  disabled={busy}
                  className="min-h-11 rounded-xl bg-orange px-5 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  {busy ? "Gerando…" : "Gerar novo Pix"}
                </button>
              )}
            </>
          ) : (
            <>
              {attempt.qr_code_base64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${attempt.qr_code_base64}`}
                  alt="QR Code Pix"
                  width={220}
                  height={220}
                  className="rounded-xl bg-white p-2"
                />
              )}
              {attempt.qr_code && (
                <>
                  <textarea
                    readOnly
                    value={attempt.qr_code}
                    rows={3}
                    className="w-full rounded-lg border border-coffee/10 bg-white px-2 py-1.5 font-mono text-[11px] text-coffee"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={copyPix}
                    className="min-h-11 w-full rounded-xl bg-orange text-sm font-extrabold text-white"
                  >
                    {copied ? "Copiado!" : "Copiar código Pix"}
                  </button>
                </>
              )}
              {attempt.date_of_expiration && countdown !== null && (
                <p className="text-xs text-coffee-soft">
                  Vence em <strong className="text-coffee">{fmtLeft(countdown)}</strong> (
                  {formatDateTime(attempt.date_of_expiration)}).
                </p>
              )}
              <p className="text-xs text-coffee-soft">Aguardando pagamento… a tela atualiza sozinha.</p>
            </>
          )}
        </div>
      )}

      {phase === "card" && (
        <div className="mt-3 flex flex-col gap-2">
          {attempt?.method === "credit_card" && (attempt.status === "in_process" || attempt.status === "authorized") ? (
            <p className="text-sm font-semibold text-coffee">
              Pagamento em análise. Você será avisado assim que for aprovado — não é preciso pagar de novo.
            </p>
          ) : (
            <>
              {!cardReady && <p className="text-xs text-coffee-soft">Carregando formulário seguro…</p>}
              <div id="mp-card-brick" />
              <button
                onClick={() => {
                  setError(null);
                  setPhase("choose");
                }}
                className="self-start text-xs font-bold text-coffee-soft"
              >
                ← Pagar por Pix em vez disso
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}

function friendlyCreateError(code?: string, message?: string): string {
  switch (code) {
    case "PIX_WINDOW_TOO_SHORT":
      return message ?? "Não há tempo suficiente para um Pix válido antes do encerramento.";
    case "DEADLINE_PASSED":
    case "EDITION_CLOSED":
      return "As encomendas desta edição já encerraram.";
    case "RESERVATION_EXPIRED":
      return "Sua reserva expirou. Faça um novo pedido.";
    case "ALREADY_PAID":
      return "Este pedido já está pago.";
    case "ONLINE_PAYMENTS_DISABLED":
      return "Pagamento online indisponível no momento.";
    case "PROVIDER_TIMEOUT":
      return "O Mercado Pago demorou para responder. Aguarde alguns segundos e tente de novo — não será cobrado duas vezes.";
    case "PROVIDER_REJECTED":
      return "O Mercado Pago não aceitou a cobrança. Tente novamente.";
    case "INVALID_EMAIL":
      return "Informe um e-mail válido.";
    case "PAYMENTS_NOT_CONFIGURED":
      return "O pagamento online ainda não está configurado. Fale com a Franck's pelo WhatsApp para combinar o pagamento.";
    default:
      return message ?? "Não foi possível iniciar o pagamento. Tente de novo.";
  }
}
