"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createClient } from "@/lib/supabase/client";
import type {
  DeliverySession,
  EditionOption,
  GeocodeStatus,
  KitchenLocation,
  RouteOrderRow,
  RoutePlanResult,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const GEOCODE_REASON_LABEL: Record<GeocodeStatus, string> = {
  ok: "Localizado",
  manual: "Ajustado manualmente",
  ambiguous: "Endereço ambíguo — confirme no mapa",
  failed: "Endereço não encontrado",
};

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ""}`;
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function RoutePlannerScreen({
  editions,
  selectedEditionId,
  windows,
  kitchenLocation,
}: {
  editions: EditionOption[];
  selectedEditionId: string;
  windows: { id: string; label: string; starts_at: string }[];
  kitchenLocation: KitchenLocation | null;
}) {
  const router = useRouter();
  const [selectedWindowId, setSelectedWindowId] = useState(windows[0]?.id ?? "");
  const [orders, setOrders] = useState<RouteOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roundTrip, setRoundTrip] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [routeResult, setRouteResult] = useState<RoutePlanResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [kitchen, setKitchen] = useState(kitchenLocation);
  const [editingKitchen, setEditingKitchen] = useState(!kitchen?.confirmed_at);
  const [kitchenInput, setKitchenInput] = useState(
    [kitchen?.address_street, kitchen?.address_number, kitchen?.neighborhood].filter(Boolean).join(", ")
  );
  const [kitchenCandidates, setKitchenCandidates] = useState<
    { lat: number; lng: number; placeName: string; relevance: number }[]
  >([]);
  const [savingKitchen, setSavingKitchen] = useState(false);

  const [fixingOrderId, setFixingOrderId] = useState<string | null>(null);
  const [fixInput, setFixInput] = useState("");
  const [fixCandidates, setFixCandidates] = useState<
    { lat: number; lng: number; placeName: string; relevance: number }[]
  >([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const courierMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [deliverySession, setDeliverySession] = useState<DeliverySession | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    async function loadSession() {
      if (!selectedWindowId || !selectedEditionId) {
        setDeliverySession(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("delivery_sessions")
        .select("*")
        .eq("edition_id", selectedEditionId)
        .eq("window_id", selectedWindowId)
        .neq("status", "ended")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setDeliverySession((data as DeliverySession | null) ?? null);
    }
    loadSession();
  }, [selectedEditionId, selectedWindowId]);

  useEffect(() => {
    if (!deliverySession) return;
    const sessionId = deliverySession.id;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-delivery-session-${channelSuffix}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "delivery_sessions", filter: `id=eq.${sessionId}` },
          (payload) => {
            setDeliverySession(payload.new as DeliverySession);
          }
        )
        .subscribe();
    }
    start();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [deliverySession?.id, channelSuffix]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !deliverySession?.lat || !deliverySession?.lng) {
      courierMarkerRef.current?.remove();
      courierMarkerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [deliverySession.lng, deliverySession.lat];
    if (!courierMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:17px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);transition:transform 1s linear;";
      el.textContent = "🛵";
      courierMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      courierMarkerRef.current.setLngLat(lngLat);
    }
  }, [deliverySession]);

  async function createTrackingLink() {
    setCreatingSession(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_create_delivery_session", {
      p_edition_id: selectedEditionId,
      p_window_id: selectedWindowId,
    });
    setCreatingSession(false);
    if (!error && data) {
      setDeliverySession({
        id: data.id,
        edition_id: selectedEditionId,
        window_id: selectedWindowId,
        token: data.token,
        status: "pending",
        lat: null,
        lng: null,
        heading: null,
        started_at: null,
        ended_at: null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  }

  useEffect(() => {
    async function fetchOrders() {
      if (!selectedWindowId) {
        setOrders([]);
        return;
      }
      setLoadingOrders(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("orders")
        .select(
          "id, customer_name, whatsapp, address_street, address_number, address_complement, address_reference, neighborhood_name_snapshot, address_lat, address_lng, address_geocode_status, order_items(product_name_snapshot, qty)"
        )
        .eq("window_id", selectedWindowId)
        .eq("fulfillment_type", "delivery")
        .in("order_status", ["confirmed", "preparing", "ready", "out_for_delivery"])
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as unknown as RouteOrderRow[];
      setOrders(rows);
      setSelected(new Set(rows.map((r) => r.id)));
      setRouteResult(null);
      setRouteError(null);
      setLoadingOrders(false);
    }
    fetchOrders();
  }, [selectedWindowId]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-50.79, -23.21],
      zoom: 13,
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeResult) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();

    if (kitchen?.lat && kitchen?.lng) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:28px;height:28px;border-radius:50%;background:#2f7a4f;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)";
      el.textContent = "C";
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([kitchen.lng, kitchen.lat]).addTo(map));
      bounds.extend([kitchen.lng, kitchen.lat]);
    }

    for (const stop of routeResult.stops) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:26px;height:26px;border-radius:50%;background:#e8540f;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)";
      el.textContent = String(stop.stopIndex);
      markersRef.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map)
      );
      bounds.extend([stop.lng, stop.lat]);
    }

    if (routeResult.geometry) {
      const sourceId = "route-line";
      const geojson = { type: "Feature" as const, properties: {}, geometry: routeResult.geometry };
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geojson);
      } else {
        map.on("load", () => {
          if (map.getSource(sourceId)) return;
          map.addSource(sourceId, { type: "geojson", data: geojson });
          map.addLayer({
            id: sourceId,
            type: "line",
            source: sourceId,
            paint: { "line-color": "#e8540f", "line-width": 4 },
          });
        });
        if (map.isStyleLoaded()) {
          map.addSource(sourceId, { type: "geojson", data: geojson });
          map.addLayer({
            id: sourceId,
            type: "line",
            source: sourceId,
            paint: { "line-color": "#e8540f", "line-width": 4 },
          });
        }
      }
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
    }
  }, [routeResult, kitchen]);

  const eligibleCount = orders.length;

  function toggleOrder(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function searchKitchenCandidates() {
    const res = await fetch("/api/admin/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${kitchenInput}, Uraí, Paraná, Brasil` }),
    });
    const data = await res.json();
    setKitchenCandidates(data.candidates ?? []);
  }

  async function confirmKitchen(candidate: { lat: number; lng: number; placeName: string }) {
    setSavingKitchen(true);
    const res = await fetch("/api/admin/kitchen-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address_street: kitchenInput,
        address_number: null,
        neighborhood: null,
        lat: candidate.lat,
        lng: candidate.lng,
      }),
    });
    const data = await res.json();
    setSavingKitchen(false);
    if (data.location) {
      setKitchen(data.location);
      setEditingKitchen(false);
      setKitchenCandidates([]);
    }
  }

  async function searchFixCandidates() {
    const res = await fetch("/api/admin/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${fixInput}, Uraí, Paraná, Brasil` }),
    });
    const data = await res.json();
    setFixCandidates(data.candidates ?? []);
  }

  async function confirmFix(orderId: string, candidate: { lat: number; lng: number }) {
    const supabase = createClient();
    await supabase
      .from("orders")
      .update({ address_lat: candidate.lat, address_lng: candidate.lng, address_geocode_status: "manual" })
      .eq("id", orderId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, address_lat: candidate.lat, address_lng: candidate.lng, address_geocode_status: "manual" }
          : o
      )
    );
    setFixingOrderId(null);
    setFixCandidates([]);
    setFixInput("");
  }

  async function generateRoute() {
    setGenerating(true);
    setRouteError(null);
    setRouteResult(null);
    const res = await fetch("/api/admin/route-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [...selected], roundTrip }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setRouteError(data.message ?? data.error ?? "Não foi possível gerar a rota.");
      return;
    }
    setRouteResult(data);
    // Pedidos problemáticos podem ter sido geocodificados agora — atualiza status local.
    setOrders((prev) =>
      prev.map((o) => {
        const failed = (data.failedOrders as { id: string; reason: GeocodeStatus }[]).find((f) => f.id === o.id);
        return failed ? { ...o, address_geocode_status: failed.reason } : o;
      })
    );
  }

  const problematicOrders = useMemo(
    () => orders.filter((o) => o.address_geocode_status === "ambiguous" || o.address_geocode_status === "failed"),
    [orders]
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
        O planejador de rotas precisa da chave do Mapbox (NEXT_PUBLIC_MAPBOX_TOKEN) configurada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-coffee">Planejador de rotas</h1>
        <select
          value={selectedEditionId}
          onChange={(e) => router.push(`/admin/rotas?edition=${e.target.value}`)}
          className="min-h-11 rounded-xl border border-coffee/10 bg-white px-3 py-2 text-sm font-semibold text-coffee"
        >
          {editions.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.title}
            </option>
          ))}
        </select>
      </div>

      {editingKitchen ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Configurar endereço da cozinha (ponto de partida)
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={kitchenInput}
              onChange={(e) => setKitchenInput(e.target.value)}
              placeholder="Rua, número, bairro"
              className="min-h-11 flex-1 rounded-lg border border-coffee/10 px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
            <button
              onClick={searchKitchenCandidates}
              className="min-h-11 rounded-lg bg-orange px-4 text-sm font-bold text-white"
            >
              Buscar
            </button>
          </div>
          {kitchenCandidates.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-cream-soft px-3 py-2 text-sm">
              <span>{c.placeName}</span>
              <button
                onClick={() => confirmKitchen(c)}
                disabled={savingKitchen}
                className="min-h-9 shrink-0 rounded-lg bg-orange-soft px-3 text-xs font-bold text-orange-dark"
              >
                Confirmar
              </button>
            </div>
          ))}
          {kitchen?.confirmed_at && (
            <button onClick={() => setEditingKitchen(false)} className="self-start text-xs font-bold text-coffee-soft">
              Cancelar
            </button>
          )}
        </section>
      ) : (
        <section className="flex items-center justify-between gap-2 rounded-2xl bg-white p-4">
          <p className="text-sm text-coffee-soft">
            Ponto de partida: <span className="font-bold text-coffee">{kitchen?.address_street}</span>
          </p>
          <button onClick={() => setEditingKitchen(true)} className="text-xs font-bold text-orange">
            Alterar
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedWindowId(w.id)}
              className={`min-h-10 rounded-full px-4 text-sm font-bold ${
                selectedWindowId === w.id ? "bg-orange text-white" : "bg-cream-soft text-coffee-soft"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {loadingOrders ? (
          <p className="text-sm text-coffee-soft">Carregando pedidos…</p>
        ) : eligibleCount === 0 ? (
          <p className="text-sm text-coffee-soft">Nenhum pedido confirmado de entrega nessa janela.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {orders.map((o) => (
              <label
                key={o.id}
                className="flex items-start gap-2.5 rounded-lg border border-coffee/10 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleOrder(o.id)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <div className="flex-1">
                  <p className="font-bold text-coffee">{o.customer_name}</p>
                  <p className="text-xs text-coffee-soft">
                    {o.address_street}, {o.address_number} — {o.neighborhood_name_snapshot}
                  </p>
                  <p className="text-xs text-coffee-soft">
                    {(o.order_items ?? []).map((i) => `${i.qty}× ${i.product_name_snapshot}`).join(", ")}
                  </p>
                  {o.address_geocode_status && o.address_geocode_status !== "ok" && (
                    <span className="mt-0.5 inline-block rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger">
                      {GEOCODE_REASON_LABEL[o.address_geocode_status]}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-semibold text-coffee-soft">
          <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
          Voltar para a cozinha no final da rota
        </label>

        <button
          onClick={generateRoute}
          disabled={generating || selected.size === 0}
          className="min-h-11 self-start rounded-xl bg-orange px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {generating ? "Gerando…" : "Gerar rota"}
        </button>

        {routeError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-semibold text-danger">{routeError}</p>
        )}
      </section>

      {selectedWindowId && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Rastreamento ao vivo do motoboy
          </h2>
          {!deliverySession ? (
            <button
              onClick={createTrackingLink}
              disabled={creatingSession}
              className="min-h-11 self-start rounded-xl bg-orange px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {creatingSession ? "Criando…" : "Criar link para o motoboy"}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    deliverySession.status === "active"
                      ? "bg-success-bg text-success"
                      : deliverySession.status === "ended"
                        ? "bg-cream-soft text-coffee-soft"
                        : "bg-warning-bg text-warning"
                  }`}
                >
                  {deliverySession.status === "active"
                    ? "🛵 Em entrega"
                    : deliverySession.status === "ended"
                      ? "Encerrado"
                      : "Aguardando o motoboy iniciar"}
                </span>
                {deliverySession.updated_at && deliverySession.status === "active" && (
                  <span className="text-xs text-coffee-soft">
                    Atualizado {new Date(deliverySession.updated_at).toLocaleTimeString("pt-BR")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Oi! Segue o link pra iniciar o rastreamento da entrega: https://francksburger.com.br/entrega/${deliverySession.token}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-10 rounded-lg bg-success-bg px-3.5 py-2 text-xs font-bold text-success"
                >
                  Enviar no WhatsApp
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(`https://francksburger.com.br/entrega/${deliverySession.token}`)
                  }
                  className="min-h-10 rounded-lg bg-cream-soft px-3.5 py-2 text-xs font-bold text-coffee-soft"
                >
                  Copiar link
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {problematicOrders.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-danger">
            Endereços que precisam de correção
          </h2>
          {problematicOrders.map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-lg bg-danger-bg/40 p-3">
              <p className="text-sm font-bold text-coffee">
                {o.customer_name} — {o.address_street}, {o.address_number}
              </p>
              {fixingOrderId === o.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={fixInput}
                      onChange={(e) => setFixInput(e.target.value)}
                      placeholder="Corrigir endereço"
                      className="min-h-10 flex-1 rounded-lg border border-coffee/10 px-3 py-2 text-sm"
                      style={{ fontSize: 16 }}
                    />
                    <button onClick={searchFixCandidates} className="min-h-10 rounded-lg bg-orange px-3 text-xs font-bold text-white">
                      Buscar
                    </button>
                  </div>
                  {fixCandidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-cream-soft px-3 py-2 text-xs">
                      <span>{c.placeName}</span>
                      <button
                        onClick={() => confirmFix(o.id, c)}
                        className="min-h-8 shrink-0 rounded-lg bg-orange-soft px-2.5 font-bold text-orange-dark"
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setFixingOrderId(o.id);
                    setFixInput(`${o.address_street}, ${o.address_number}`);
                  }}
                  className="self-start text-xs font-bold text-orange"
                >
                  Corrigir endereço
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {routeResult && routeResult.stops.length > 0 && (
        <>
          <section className="rounded-2xl bg-white p-2">
            <div ref={mapContainerRef} className="h-[360px] w-full rounded-xl" />
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
            <div className="flex flex-wrap gap-4 text-sm font-bold text-coffee">
              <span>Distância total: {formatDistance(routeResult.totalDistanceMeters)}</span>
              <span>Tempo estimado: {formatDuration(routeResult.totalDurationSeconds)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {routeResult.stops.map((stop) => (
                <div key={stop.stopIndex} className="flex gap-3 rounded-lg border border-coffee/10 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-white">
                    {stop.stopIndex}
                  </span>
                  <div className="flex-1">
                    {stop.orders.map((o) => (
                      <p key={o.id} className="text-sm">
                        <span className="font-bold text-coffee">{o.customerName}</span>
                        {o.items && <span className="text-coffee-soft"> — {o.items}</span>}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
