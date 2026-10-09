"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_UPDATE_INTERVAL_MS = 4000;
const DEVICE_ID_KEY = "francksburger.courier.deviceId";
const QUEUE_KEY_PREFIX = "francksburger.courier.offlineQueue.";
const MAX_QUEUE_LENGTH = 200;

type Phase = "loading" | "invalid" | "idle" | "active" | "ended" | "error" | "locked";

type QueuedPosition = {
  lat: number;
  lng: number;
  heading: number | null;
  capturedAt: number;
};

type PaymentMethod = "pix" | "card" | "cash";

type OrderPaymentStatus = "pending" | "proof_submitted" | "paid" | "refund_pending" | "refunded";

type SessionStop = {
  stop_index: number;
  customer_name: string;
  whatsapp: string | null;
  address: string | null;
  items: string | null;
  delivered_at: string | null;
  payment_method_original: PaymentMethod | null;
  payment_method_confirmed: PaymentMethod | null;
  lat: number | null;
  lng: number | null;
  order_id: string | null;
  order_payment_status: OrderPaymentStatus | null;
  order_total_cents: number | null;
  order_cash_change_for_cents: number | null;
};

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
};

// Formato oficial de deep link do Waze (developers.google.com/waze/deeplinks):
// abre o app já navegando até a coordenada, sem precisar digitar o endereço.
function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Navegador sem localStorage (modo privado restrito) — ainda funciona,
    // só perde a trava de "mesmo aparelho continua liberado" ao recarregar.
    return crypto.randomUUID();
  }
}

// Enquanto não há internet, guarda as posições no aparelho em vez de
// perdê-las — assim que a conexão voltar, reenviamos tudo em ordem pra não
// deixar buraco no trajeto mostrado no mapa.
function loadQueue(token: string): QueuedPosition[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY_PREFIX + token);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(token: string, queue: QueuedPosition[]) {
  try {
    localStorage.setItem(QUEUE_KEY_PREFIX + token, JSON.stringify(queue.slice(-MAX_QUEUE_LENGTH)));
  } catch {
    // Sem storage disponível — a fila fica só em memória pra essa sessão.
  }
}

function clearQueue(token: string) {
  try {
    localStorage.removeItem(QUEUE_KEY_PREFIX + token);
  } catch {
    // ignore
  }
}

export function CourierTrackingScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [weakSignal, setWeakSignal] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [stops, setStops] = useState<SessionStop[]>([]);
  const [markingStop, setMarkingStop] = useState<number | null>(null);
  const [confirmingStop, setConfirmingStop] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Record<number, PaymentMethod>>({});
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const deviceIdRef = useRef<string>("");
  const queueRef = useRef<QueuedPosition[]>([]);
  const flushingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
  }, []);

  function enqueue(position: QueuedPosition) {
    queueRef.current = [...queueRef.current, position].slice(-MAX_QUEUE_LENGTH);
    saveQueue(token, queueRef.current);
    setQueuedCount(queueRef.current.length);
  }

  // Tenta reenviar a fila em ordem; para no primeiro erro (provavelmente
  // ainda sem internet) e tenta de novo mais tarde, sem perder nada.
  async function flushQueue() {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      const supabase = createClient();
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        const { error } = await supabase.rpc("update_delivery_position", {
          p_token: token,
          p_lat: next.lat,
          p_lng: next.lng,
          p_heading: next.heading,
        });
        if (error) break;
        queueRef.current = queueRef.current.slice(1);
        saveQueue(token, queueRef.current);
        setQueuedCount(queueRef.current.length);
        setLastSentAt(next.capturedAt);
      }
      if (queueRef.current.length === 0) clearQueue(token);
    } finally {
      flushingRef.current = false;
    }
  }

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_session_status", { p_token: token });
      if (error || !data?.found) {
        setPhase("invalid");
        return;
      }
      if (data.status === "ended") setPhase("ended");
      else setPhase("idle");
    }
    checkSession();
  }, [token]);

  async function loadStops() {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_session_stops", { p_token: token });
    if (data?.found) setStops(data.stops ?? []);
  }

  useEffect(() => {
    loadStops();
  }, [token]);

  async function markDelivered(stopIndex: number) {
    setMarkingStop(stopIndex);
    const supabase = createClient();
    const { error } = await supabase.rpc("courier_mark_delivered", {
      p_token: token,
      p_stop_index: stopIndex,
    });
    setMarkingStop(null);
    if (!error) {
      setStops((prev) =>
        prev.map((s) => (s.stop_index === stopIndex ? { ...s, delivered_at: new Date().toISOString() } : s))
      );
    }
  }

  async function confirmPaymentForStop(stopIndex: number) {
    const stop = stops.find((s) => s.stop_index === stopIndex);
    const method = selectedMethod[stopIndex] ?? stop?.payment_method_original ?? "pix";
    setConfirmingStop(stopIndex);
    const supabase = createClient();
    const { error } = await supabase.rpc("courier_confirm_payment", {
      p_token: token,
      p_stop_index: stopIndex,
      p_method: method,
    });
    setConfirmingStop(null);
    if (!error) {
      setStops((prev) =>
        prev.map((s) =>
          s.stop_index === stopIndex
            ? { ...s, payment_method_confirmed: method, order_payment_status: "paid" }
            : s
        )
      );
    }
  }

  function stopWatching() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  async function startDelivery() {
    if (!navigator.geolocation) {
      setErrorMessage("Esse navegador não suporta localização.");
      setPhase("error");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("start_delivery_session", {
      p_token: token,
      p_device_id: deviceIdRef.current,
    });
    if (error) {
      if (error.message === "ALREADY_ACTIVE_ELSEWHERE") {
        setPhase("locked");
      } else {
        setErrorMessage("Não foi possível iniciar — peça um novo link.");
        setPhase("error");
      }
      return;
    }

    // Retoma qualquer posição que ficou presa de uma queda de conexão
    // anterior (ex: página recarregada sem internet) antes de começar a
    // mandar posições novas.
    queueRef.current = loadQueue(token);
    setQueuedCount(queueRef.current.length);

    setPhase("active");
    setWeakSignal(false);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setWeakSignal(false);
        const now = Date.now();
        if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL_MS) return;
        lastUpdateRef.current = now;

        const current: QueuedPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          capturedAt: now,
        };

        // Se já tem coisa acumulada na fila, manda essa posição pro final
        // da fila também — assim a ordem do trajeto nunca se embaralha.
        if (queueRef.current.length > 0) {
          enqueue(current);
          flushQueue();
          return;
        }

        const supabase = createClient();
        const { error } = await supabase.rpc("update_delivery_position", {
          p_token: token,
          p_lat: current.lat,
          p_lng: current.lng,
          p_heading: current.heading,
        });
        if (error) {
          enqueue(current);
          return;
        }
        setLastSentAt(now);
      },
      (err) => {
        // Sinal fraco ou demora momentânea (comum logo no início, "cold start"
        // do GPS, ou passando por um túnel/prédio) não deve derrubar o
        // rastreamento — o navegador continua tentando sozinho em segundo
        // plano. Só paramos de vez se o problema for falta de permissão, que
        // aí sim não tem como se resolver sozinho.
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMessage("Não foi possível acessar sua localização. Permita o acesso e tente de novo.");
          setPhase("error");
          stopWatching();
          return;
        }
        setWeakSignal(true);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 25000 }
    );
  }

  async function finishDelivery() {
    stopWatching();
    await flushQueue();
    const supabase = createClient();
    await supabase.rpc("end_delivery_session", { p_token: token });
    setPhase("ended");
  }

  useEffect(() => {
    return () => stopWatching();
  }, []);

  // Enquanto a entrega está ativa, tenta reenviar a fila pendente sempre que
  // a internet voltar (evento "online") e também de tempos em tempos — o
  // evento "online" nem sempre dispara de forma confiável em celular.
  useEffect(() => {
    if (phase !== "active") return;
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    flushTimerRef.current = setInterval(() => flushQueue(), 10000);
    return () => {
      window.removeEventListener("online", onOnline);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [phase]);

  // Sempre a primeira parada ainda sem entrega confirmada, na ordem da rota
  // planejada — recalculado sozinho a cada "Entregue", então se o motoboy
  // entregar fora de ordem (ex: a 3 antes da 1), o botão "Navegar" já aponta
  // pra próxima pendente de verdade, sem precisar refazer a rota manualmente.
  const nextStop = stops
    .filter((s) => !s.delivered_at && s.lat !== null && s.lng !== null)
    .sort((a, b) => a.stop_index - b.stop_index)[0];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-coffee px-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl font-extrabold text-white">Franck&rsquo;s Burger</span>
        <span className="text-sm text-white/60">Rastreamento de entrega</span>
      </div>

      {phase === "loading" && <p className="text-white/70">Carregando…</p>}

      {phase === "invalid" && (
        <p className="max-w-xs text-sm text-white/80">
          Esse link não é válido. Peça um link novo pra Franck&rsquo;s Burger.
        </p>
      )}

      {phase === "locked" && (
        <div className="flex flex-col items-center gap-4">
          <p className="max-w-xs text-sm text-white/80">
            Essa entrega já está sendo rastreada em outro aparelho agora. Só dá pra usar um por
            vez — peça pra quem está com ela aberta finalizar primeiro, ou peça um link novo.
          </p>
          <button
            onClick={() => setPhase("idle")}
            className="min-h-11 rounded-full bg-white/10 px-6 text-sm font-bold text-white"
          >
            Voltar
          </button>
        </div>
      )}

      {phase === "idle" && (
        <div className="flex flex-col items-center gap-5">
          <p className="max-w-xs text-sm text-white/80">
            Toque no botão abaixo quando sair pra entrega. Vamos acompanhar sua localização só
            durante a entrega, pra mostrar o trajeto no mapa.
          </p>
          <button
            onClick={startDelivery}
            className="flex min-h-14 items-center gap-2 rounded-full bg-orange px-8 text-base font-extrabold text-white shadow-lg active:scale-95"
          >
            🛵 Iniciar entrega
          </button>
        </div>
      )}

      {phase === "active" && (
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex h-24 w-24 items-center justify-center">
            {!weakSignal && queuedCount === 0 && (
              <>
                <span className="absolute h-full w-full animate-ping rounded-full bg-success/40" />
                <span className="absolute h-16 w-16 animate-ping rounded-full bg-success/50 [animation-delay:200ms]" />
              </>
            )}
            <span
              className={`relative flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                queuedCount > 0 ? "bg-warning" : weakSignal ? "bg-warning" : "bg-success"
              }`}
            >
              🛵
            </span>
          </div>
          <div>
            <p className="text-base font-extrabold text-white">
              {queuedCount > 0
                ? "Sem internet — salvando no aparelho…"
                : weakSignal
                  ? "Buscando sinal de GPS…"
                  : "Transmitindo localização…"}
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              {lastSentAt
                ? `Última atualização: ${new Date(lastSentAt).toLocaleTimeString("pt-BR")}`
                : "Aguardando primeiro sinal…"}
            </p>
            {queuedCount > 0 && (
              <p className="mt-1 text-xs text-warning">
                {queuedCount} {queuedCount === 1 ? "posição" : "posições"} aguardando internet pra
                enviar. Nada se perde — assim que a conexão voltar, envia tudo automaticamente.
              </p>
            )}
            <p className="mt-2 max-w-[220px] text-xs text-white/50">
              Mantenha essa aba aberta e a tela do celular ligada durante a entrega.
            </p>
          </div>
          <button
            onClick={finishDelivery}
            className="flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-6 text-sm font-bold text-white active:scale-95"
          >
            Finalizar entrega
          </button>
        </div>
      )}

      {phase === "active" && nextStop && (
        <a
          href={wazeUrl(nextStop.lat!, nextStop.lng!)}
          className="flex w-full max-w-sm min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange px-6 text-base font-extrabold text-white shadow-lg active:scale-95"
        >
          🧭 Navegar até {nextStop.customer_name.split(/\s+/)[0]}
        </a>
      )}

      {(phase === "idle" || phase === "active") && stops.length > 0 && (
        <div className="flex w-full max-w-sm flex-col gap-2 overflow-y-auto rounded-2xl bg-white/5 p-3 text-left">
          <p className="px-1 text-xs font-bold uppercase tracking-wide text-white/50">
            {stops.length} entrega{stops.length === 1 ? "" : "s"}
          </p>
          {stops.map((s) => {
            const isPaid = s.order_payment_status === "paid";
            const isNext = nextStop?.stop_index === s.stop_index;
            return (
              <div
                key={s.stop_index}
                className={`flex flex-col gap-2.5 rounded-xl p-3 ${
                  s.delivered_at
                    ? "bg-success/10"
                    : isNext
                      ? "bg-orange/15 ring-1 ring-orange/50"
                      : "bg-white/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      s.delivered_at ? "bg-success text-white" : isNext ? "bg-orange text-white" : "bg-white/20 text-white"
                    }`}
                  >
                    {s.delivered_at ? "✓" : s.stop_index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-white">{s.customer_name}</p>
                      {isNext && (
                        <span className="shrink-0 rounded-full bg-orange px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                          PRÓXIMA
                        </span>
                      )}
                      {s.lat !== null && s.lng !== null && (
                        <a
                          href={wazeUrl(s.lat, s.lng)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15"
                          aria-label="Abrir no Waze"
                          title="Abrir no Waze"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7ab7ff" strokeWidth="2">
                            <path d="M12 2C7 2 3 6 3 11c0 5 6 10 9 11 3-1 9-6 9-11 0-5-4-9-9-9Z" strokeLinejoin="round" />
                            <circle cx="12" cy="11" r="2.5" fill="#7ab7ff" stroke="none" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <p className="truncate text-xs text-white/60">{s.address}</p>
                    {s.items && <p className="truncate text-xs text-white/50">{s.items}</p>}
                  </div>
                  {!s.delivered_at && (
                    <button
                      onClick={() => markDelivered(s.stop_index)}
                      disabled={markingStop === s.stop_index}
                      className="shrink-0 rounded-full bg-orange px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {markingStop === s.stop_index ? "…" : "Entregue"}
                    </button>
                  )}
                </div>

                <div className={`rounded-lg px-2.5 py-2 ${isPaid ? "bg-success/15" : "bg-white/10"}`}>
                  {isPaid ? (
                    <p className="text-xs font-extrabold text-success">PAGO — NÃO COBRAR</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {s.order_total_cents !== null && (
                        <span className="text-xs font-bold text-warning">
                          A cobrar: {formatCentsBRL(s.order_total_cents)}
                          {s.order_cash_change_for_cents
                            ? ` · troco p/ ${formatCentsBRL(s.order_cash_change_for_cents)}`
                            : ""}
                        </span>
                      )}
                      <select
                        value={selectedMethod[s.stop_index] ?? s.payment_method_original ?? "pix"}
                        onChange={(e) =>
                          setSelectedMethod((prev) => ({ ...prev, [s.stop_index]: e.target.value as PaymentMethod }))
                        }
                        className="min-h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-xs font-semibold text-white"
                        style={{ fontSize: 14 }}
                      >
                        <option className="text-coffee" value="pix">Pix</option>
                        <option className="text-coffee" value="card">Cartão</option>
                        <option className="text-coffee" value="cash">Dinheiro</option>
                      </select>
                      <button
                        onClick={() => confirmPaymentForStop(s.stop_index)}
                        disabled={confirmingStop === s.stop_index}
                        className="min-h-8 rounded-full bg-success px-3 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {confirmingStop === s.stop_index ? "…" : "Confirmar pagamento"}
                      </button>
                    </div>
                  )}
                  {isPaid && s.payment_method_confirmed && (
                    <p className="mt-0.5 text-[11px] text-success/80">
                      Recebido em {PAYMENT_METHOD_LABEL[s.payment_method_confirmed]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {phase === "ended" && (
        <p className="max-w-xs text-sm text-white/80">
          Entrega finalizada. Obrigado! Pode fechar essa página.
        </p>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-4">
          <p className="max-w-xs text-sm text-danger">{errorMessage}</p>
          <button
            onClick={() => setPhase("idle")}
            className="min-h-11 rounded-full bg-white/10 px-6 text-sm font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
