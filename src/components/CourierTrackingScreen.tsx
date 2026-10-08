"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_UPDATE_INTERVAL_MS = 4000;
const DEVICE_ID_KEY = "francksburger.courier.deviceId";

type Phase = "loading" | "invalid" | "idle" | "active" | "ended" | "error" | "locked";

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

export function CourierTrackingScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [weakSignal, setWeakSignal] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
  }, []);

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

    setPhase("active");
    setWeakSignal(false);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setWeakSignal(false);
        const now = Date.now();
        if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL_MS) return;
        lastUpdateRef.current = now;
        const supabase = createClient();
        await supabase.rpc("update_delivery_position", {
          p_token: token,
          p_lat: pos.coords.latitude,
          p_lng: pos.coords.longitude,
          p_heading: pos.coords.heading,
        });
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
    const supabase = createClient();
    await supabase.rpc("end_delivery_session", { p_token: token });
    setPhase("ended");
  }

  useEffect(() => {
    return () => stopWatching();
  }, []);

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
            {!weakSignal && (
              <>
                <span className="absolute h-full w-full animate-ping rounded-full bg-success/40" />
                <span className="absolute h-16 w-16 animate-ping rounded-full bg-success/50 [animation-delay:200ms]" />
              </>
            )}
            <span
              className={`relative flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                weakSignal ? "bg-warning" : "bg-success"
              }`}
            >
              🛵
            </span>
          </div>
          <div>
            <p className="text-base font-extrabold text-white">
              {weakSignal ? "Buscando sinal de GPS…" : "Transmitindo localização…"}
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              {lastSentAt
                ? `Última atualização: ${new Date(lastSentAt).toLocaleTimeString("pt-BR")}`
                : "Aguardando primeiro sinal…"}
            </p>
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
