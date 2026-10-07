"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_UPDATE_INTERVAL_MS = 4000;

type Phase = "loading" | "invalid" | "idle" | "active" | "ended" | "error";

export function CourierTrackingScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

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
    const { error } = await supabase.rpc("start_delivery_session", { p_token: token });
    if (error) {
      setErrorMessage("Não foi possível iniciar — peça um novo link.");
      setPhase("error");
      return;
    }

    setPhase("active");
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
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
      () => {
        setErrorMessage("Não foi possível acessar sua localização. Permita o acesso e tente de novo.");
        setPhase("error");
        stopWatching();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
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
            <span className="absolute h-full w-full animate-ping rounded-full bg-success/40" />
            <span className="absolute h-16 w-16 animate-ping rounded-full bg-success/50 [animation-delay:200ms]" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-success text-2xl">
              🛵
            </span>
          </div>
          <div>
            <p className="text-base font-extrabold text-white">Transmitindo localização…</p>
            <p className="mt-0.5 text-xs text-white/60">
              {lastSentAt ? "Atualizado agora" : "Aguardando sinal de GPS…"}
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
