"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import { ensureMaplibreWorker } from "@/lib/maplibre-worker-setup";
import type {
  DeliverySession,
  DeliverySessionStop,
  EditionOption,
  GeocodeStatus,
  KitchenLocation,
  RouteAvoidPoint,
  RouteOrderRow,
  RoutePlanResult,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const ROUTE_ORANGE = "#e8540f";

// Uma cor por trecho da rota (cozinha→parada 1, parada 1→parada 2...), pra
// dar pra acompanhar visualmente qual pedaço leva a qual entrega. A primeira
// parada fica com o laranja da marca; as demais giram por uma paleta fixa,
// escolhida pra ficar bem distinguível sobre o mapa claro (Positron).
const LEG_COLOR_PALETTE = [ROUTE_ORANGE, "#2563eb", "#059669", "#7c3aed", "#db2777", "#0891b2", "#ca8a04"];
function legColor(stopIndex: number): string {
  return LEG_COLOR_PALETTE[(stopIndex - 1) % LEG_COLOR_PALETTE.length];
}

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

function formatEta(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function storeIconEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:30px;height:30px;border-radius:50%;background:#2f1a12;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35)";
  el.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-4h8v4a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V9M3 9h18" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return el;
}

function stopMarkerEl(index: number, active: boolean, color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${active ? 34 : 28}px;height:${active ? 34 : 28}px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${active ? 15 : 13}px;border:2px solid white;box-shadow:${active ? "0 2px 10px rgba(0,0,0,0.45)" : "0 1px 4px rgba(0,0,0,0.3)"};transition:width 150ms,height 150ms;cursor:pointer;`;
  el.textContent = String(index);
  return el;
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
  const hasRoute = Boolean(routeResult && routeResult.stops.length > 0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<number | null>(null);

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

  const [avoidPoints, setAvoidPoints] = useState<RouteAvoidPoint[]>([]);
  const [pickingAvoidPoint, setPickingAvoidPoint] = useState(false);
  const [showAvoidPointsPanel, setShowAvoidPointsPanel] = useState(false);
  const pickingAvoidRef = useRef(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const avoidMarkersRef = useRef<maplibregl.Marker[]>([]);
  const courierMarkerRef = useRef<maplibregl.Marker | null>(null);
  const lastBoundsRef = useRef<maplibregl.LngLatBounds | null>(null);

  const [deliverySession, setDeliverySession] = useState<DeliverySession | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionStops, setSessionStops] = useState<DeliverySessionStop[]>([]);
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;

  // Acompanha em tempo real quais paradas o motoboy já marcou como
  // entregues (ele marca pelo próprio link de rastreamento no celular).
  useEffect(() => {
    if (!deliverySession?.id) {
      setSessionStops([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    async function loadStops() {
      const { data } = await supabase
        .from("delivery_session_stops")
        .select("*")
        .eq("session_id", deliverySession!.id)
        .order("stop_index", { ascending: true });
      if (!cancelled) setSessionStops((data as DeliverySessionStop[] | null) ?? []);
    }
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      await loadStops();
      channel = supabase
        .channel(`admin-session-stops-${deliverySession!.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delivery_session_stops", filter: `session_id=eq.${deliverySession!.id}` },
          () => loadStops()
        )
        .subscribe();
    }
    subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [deliverySession?.id]);

  function stopDeliveryInfo(stop: { stopIndex: number; orders: { id: string; customerName: string; whatsapp: string }[] }) {
    const sessionStop = sessionStops.find((s) => s.stop_index === stop.stopIndex);
    if (!sessionStop?.delivered_at) return null;
    const firstWhatsapp = stop.orders[0]?.whatsapp;
    const firstName = stop.orders[0]?.customerName?.split(" ")[0] ?? "";
    const feedbackMessage = `Oi, ${firstName}! Aqui é da Franck's Burger 🍔 Esperamos que tenha gostado do seu lanche! Se puder, manda um feedback pra gente aqui ou tira uma fotinho e marca a gente no Instagram 😄`;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">
          Entregue às{" "}
          {new Date(sessionStop.delivered_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })}
        </span>
        {firstWhatsapp && (
          <a
            href={`https://wa.me/55${firstWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(feedbackMessage)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-full bg-cream-soft px-2 py-0.5 text-[11px] font-bold text-coffee-soft"
          >
            Enviar feedback no WhatsApp
          </a>
        )}
      </div>
    );
  }

  useEffect(() => {
    if (!selectedWindowId || !selectedEditionId) {
      setDeliverySession(null);
      return;
    }
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function loadSession() {
      const { data } = await supabase
        .from("delivery_sessions")
        .select("*")
        .eq("edition_id", selectedEditionId)
        .eq("window_id", selectedWindowId)
        .neq("status", "ended")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setDeliverySession((data as DeliverySession | null) ?? null);
    }

    async function start() {
      await loadSession();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      // Escuta desde já (não só depois de já ter uma sessão carregada nesta
      // aba) — assim, se o link for criado em outro dispositivo/aba enquanto
      // esta tela está aberta, ela também fica sabendo sozinha.
      channel = supabase
        .channel(`admin-delivery-session-${channelSuffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delivery_sessions", filter: `window_id=eq.${selectedWindowId}` },
          () => loadSession()
        )
        .subscribe();
    }
    start();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedEditionId, selectedWindowId, channelSuffix]);

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
        "width:28px;height:28px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);transition:transform 1s linear;";
      el.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM7 17h6m-3-5 2-5h3l2 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      courierMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      courierMarkerRef.current.setLngLat(lngLat);
    }
  }, [deliverySession]);

  async function persistSessionStops(sessionId: string, plan: RoutePlanResult) {
    await fetch("/api/admin/session-stops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        stops: plan.stops.map((s) => ({
          stopIndex: s.stopIndex,
          orderId: s.orders[0]?.id ?? null,
          customerName: s.orders.map((o) => o.customerName).join(" + "),
          whatsapp: s.orders[0]?.whatsapp ?? null,
          paymentMethod: s.orders[0]?.paymentMethod ?? null,
          address: s.orders[0]?.address ?? s.addressLabel,
          items: s.orders.map((o) => o.items).join(" | "),
          lat: s.lat,
          lng: s.lng,
        })),
      }),
    });
  }

  async function createTrackingLink(plan?: RoutePlanResult) {
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
        active_device_id: null,
      });

      // Salva a lista de paradas (nomes, endereços, itens) junto do link de
      // rastreamento, pra o motoboy ver a rota completa com ordem e nomes no
      // celular dele e poder marcar cada entrega como feita.
      const planToPersist = plan ?? routeResult;
      if (planToPersist) await persistSessionStops(data.id, planToPersist);
    }
  }

  // Sempre que uma rota nova é gerada enquanto já existe um link ativo pro
  // motoboy, aquele link antigo é encerrado e um novo é criado na hora — o
  // link que já tinha sido enviado passa a mostrar "entrega finalizada" e
  // deixa de aceitar GPS, então precisa de fato trocar de link, não só
  // atualizar a lista por baixo dele.
  async function refreshTrackingLinkIfNeeded(plan: RoutePlanResult) {
    if (!deliverySession || deliverySession.status === "ended") return;
    const supabase = createClient();
    await supabase.rpc("end_delivery_session", { p_token: deliverySession.token });
    await createTrackingLink(plan);
  }

  useEffect(() => {
    pickingAvoidRef.current = pickingAvoidPoint;
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = pickingAvoidPoint ? "crosshair" : "";
  }, [pickingAvoidPoint]);

  useEffect(() => {
    async function loadAvoidPoints() {
      const res = await fetch("/api/admin/avoid-points");
      const data = await res.json();
      setAvoidPoints(data.points ?? []);
    }
    loadAvoidPoints();
  }, []);

  async function addAvoidPoint(lat: number, lng: number) {
    const res = await fetch("/api/admin/avoid-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    const data = await res.json();
    if (data.point) setAvoidPoints((prev) => [...prev, data.point]);
    setPickingAvoidPoint(false);
  }

  async function removeAvoidPoint(id: string) {
    setAvoidPoints((prev) => prev.filter((p) => p.id !== id));
    await fetch("/api/admin/avoid-points", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function fetchOrders(windowId: string, resetSelection: boolean) {
    if (!windowId) {
      setOrders([]);
      return;
    }
    if (resetSelection) setLoadingOrders(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .select(
        "id, customer_name, whatsapp, address_street, address_number, address_complement, address_reference, neighborhood_name_snapshot, address_lat, address_lng, address_geocode_status, order_items(product_name_snapshot, qty)"
      )
      .eq("window_id", windowId)
      .eq("fulfillment_type", "delivery")
      .in("order_status", ["confirmed", "preparing", "ready", "out_for_delivery"])
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as unknown as RouteOrderRow[];
    if (resetSelection) {
      setOrders(rows);
      setSelected(new Set(rows.map((r) => r.id)));
      setRouteResult(null);
      setRouteError(null);
      setSelectedStop(null);
    } else {
      // Atualização automática (pedido novo, cancelado, status mudou): mantém a
      // seleção manual de quem já estava marcado/desmarcado, só adiciona os
      // pedidos novos já selecionados por padrão e tira quem saiu da janela.
      // Usa a forma funcional dos dois setters pra nunca comparar com um
      // "orders"/"selected" desatualizado (a função pode ser chamada de dentro
      // de um callback do Realtime criado em outra renderização).
      setOrders((prevOrders) => {
        const prevIds = new Set(prevOrders.map((o) => o.id));
        setSelected((prevSelected) => {
          const rowIds = new Set(rows.map((r) => r.id));
          const next = new Set([...prevSelected].filter((id) => rowIds.has(id)));
          for (const r of rows) {
            if (!prevIds.has(r.id)) next.add(r.id);
          }
          return next;
        });
        return rows;
      });
    }
    setLoadingOrders(false);
  }

  useEffect(() => {
    fetchOrders(selectedWindowId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWindowId]);

  useEffect(() => {
    if (!selectedWindowId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-rotas-orders-${channelSuffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `window_id=eq.${selectedWindowId}` },
          () => fetchOrders(selectedWindowId, false)
        )
        .subscribe();
    }
    start();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWindowId, channelSuffix]);

  const showMapSection = Boolean(deliverySession) || hasRoute || pickingAvoidPoint || avoidPoints.length > 0;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    ensureMaplibreWorker();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-50.79, -23.21],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => {
      console.error("Map error", e);
      setMapError("Não foi possível carregar o mapa agora. Tente recarregar a página.");
    });
    map.on("click", (e) => {
      if (!pickingAvoidRef.current) return;
      addAvoidPoint(e.lngLat.lat, e.lngLat.lng);
    });
    map.getCanvas().style.cursor = "";
    mapRef.current = map;
    // O container só existe no DOM quando essa condição vira true — se o efeito
    // rodasse só uma vez (deps vazias), ele rodaria antes da seção aparecer e
    // nunca criaria o mapa.
  }, [showMapSection]);

  useEffect(() => {
    // O grid muda de 1 coluna (mapa cheio) pra 2 colunas (mapa + lista) — o
    // MapLibre precisa ser avisado disso, senão os blocos do mapa ficam
    // desalinhados até o próximo resize manual da janela.
    const map = mapRef.current;
    if (!map) return;
    const timeout = setTimeout(() => map.resize(), 0);
    return () => clearTimeout(timeout);
  }, [hasRoute]);

  function fitToRoute() {
    const map = mapRef.current;
    const bounds = lastBoundsRef.current;
    if (!map || !bounds || bounds.isEmpty()) return;
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 16, duration: prefersReducedMotion() ? 0 : 500 });
  }

  function flyToStop(index: number) {
    const map = mapRef.current;
    const stop = routeResult?.stops.find((s) => s.stopIndex === index);
    if (!map || !stop) return;
    setSelectedStop(index);
    map.flyTo({ center: [stop.lng, stop.lat], zoom: 16.5, duration: prefersReducedMotion() ? 0 : 600, essential: true });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeResult) return;

    function draw() {
      if (!map) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds = new maplibregl.LngLatBounds();

      if (kitchen?.lat && kitchen?.lng) {
        markersRef.current.push(new maplibregl.Marker({ element: storeIconEl() }).setLngLat([kitchen.lng, kitchen.lat]).addTo(map));
        bounds.extend([kitchen.lng, kitchen.lat]);
      }

      for (const stop of routeResult!.stops) {
        const el = stopMarkerEl(stop.stopIndex, selectedStop === stop.stopIndex, legColor(stop.stopIndex));
        el.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          flyToStop(stop.stopIndex);
        });
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map));
        bounds.extend([stop.lng, stop.lat]);
      }

      // Um trecho por parada (cozinha→1, 1→2, 2→3...), cada um com sua própria
      // cor — assim dá pra acompanhar visualmente qual pedaço da rota leva a
      // qual entrega, em vez de uma linha só de ponta a ponta.
      const sourceId = "route-line";
      const legFeatures = routeResult!.stops
        .filter((stop) => stop.legGeometry)
        .map((stop) => ({
          type: "Feature" as const,
          properties: { color: legColor(stop.stopIndex) },
          geometry: stop.legGeometry!,
        }));
      const legCollection = { type: "FeatureCollection" as const, features: legFeatures };
      const existingLegs = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existingLegs) {
        existingLegs.setData(legCollection);
      } else {
        map.addSource(sourceId, { type: "geojson", data: legCollection });
        map.addLayer({
          id: "route-line-halo",
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 5 },
        });
      }

      // Trecho de volta (depois da última parada até a cozinha) em estilo
      // diferente — tracejado e mais escuro — pra ficar claro no mapa que é
      // o caminho de retorno, não uma rota duplicada por cima da de ida.
      const returnSourceId = "route-return-line";
      if (routeResult!.returnGeometry) {
        const geojson = { type: "Feature" as const, properties: {}, geometry: routeResult!.returnGeometry };
        const existing = map.getSource(returnSourceId) as maplibregl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(geojson);
        } else {
          map.addSource(returnSourceId, { type: "geojson", data: geojson });
          map.addLayer({
            id: "route-return-line-halo",
            type: "line",
            source: returnSourceId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "route-return-line",
            type: "line",
            source: returnSourceId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#5b4636",
              "line-width": 4,
              "line-dasharray": [0.1, 1.8],
            },
          });
        }
      } else {
        const existing = map.getSource(returnSourceId) as maplibregl.GeoJSONSource | undefined;
        if (existing) existing.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      }

      if (!bounds.isEmpty()) {
        lastBoundsRef.current = bounds;
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 60, right: 60 },
          maxZoom: 16,
          duration: prefersReducedMotion() ? 0 : 500,
        });
      }
    }

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeResult, kitchen, selectedStop]);

  // Marcadores de "rua a evitar" (ruas esburacadas ou com dado de mapa
  // errado) — ficam num efeito à parte porque precisam aparecer mesmo sem
  // nenhuma rota gerada ainda, enquanto o admin tá marcando os pontos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function drawAvoidMarkers() {
      if (!map) return;
      avoidMarkersRef.current.forEach((m) => m.remove());
      avoidMarkersRef.current = [];
      for (const point of avoidPoints) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:22px;height:22px;border-radius:50%;background:#b91c1c;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);cursor:pointer;";
        el.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/></svg>';
        el.title = "Remover ponto a evitar";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          removeAvoidPoint(point.id);
        });
        avoidMarkersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map)
        );
      }
    }

    if (map.isStyleLoaded()) drawAvoidMarkers();
    else map.once("load", drawAvoidMarkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avoidPoints]);

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
    setSelectedStop(null);
    const res = await fetch("/api/admin/route-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [...selected], roundTrip, windowId: selectedWindowId }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setRouteError(data.message ?? data.error ?? "Não foi possível gerar a rota.");
      return;
    }
    setRouteResult(data);
    setOrders((prev) =>
      prev.map((o) => {
        const failed = (data.failedOrders as { id: string; reason: GeocodeStatus }[]).find((f) => f.id === o.id);
        return failed ? { ...o, address_geocode_status: failed.reason } : o;
      })
    );
    await refreshTrackingLinkIfNeeded(data);
  }

  const problematicOrders = useMemo(
    () => orders.filter((o) => o.address_geocode_status === "ambiguous" || o.address_geocode_status === "failed"),
    [orders]
  );

  const selectedStopData = routeResult?.stops.find((s) => s.stopIndex === selectedStop) ?? null;

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
        O planejador de rotas precisa da chave do Mapbox (NEXT_PUBLIC_MAPBOX_TOKEN) configurada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-coffee">Planejador de rotas</h1>
            <p className="text-xs font-semibold text-coffee-soft">Franck&rsquo;s Burger · Uraí, PR</p>
          </div>
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
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            onClick={generateRoute}
            disabled={generating || selected.size === 0}
            className="ml-auto min-h-11 rounded-xl bg-orange px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {generating ? "Gerando…" : "Gerar rota"}
          </button>
        </div>
        {routeError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-semibold text-danger">{routeError}</p>
        )}
      </section>

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
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Pedidos da janela
        </h2>
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
      </section>

      {selectedWindowId && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Acompanhamento ao vivo do motoboy
          </h2>
          {!deliverySession ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => createTrackingLink()}
                disabled={creatingSession || !hasRoute}
                className="min-h-11 self-start rounded-xl bg-orange px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {creatingSession ? "Criando…" : "Criar link para o motoboy"}
              </button>
              {!hasRoute && (
                <p className="text-xs text-coffee-soft">Gere a rota primeiro, pra o link já sair com a lista de entregas.</p>
              )}
            </div>
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
                    ? "Em entrega"
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

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <button
          onClick={() => setShowAvoidPointsPanel((v) => !v)}
          className="flex items-center justify-between gap-2 text-left"
        >
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Ruas a evitar {avoidPoints.length > 0 && `(${avoidPoints.length})`}
          </h2>
          <span className="text-coffee-soft">{showAvoidPointsPanel ? "▾" : "▸"}</span>
        </button>
        {showAvoidPointsPanel && (
          <>
            <p className="text-sm text-coffee-soft">
              Marque no mapa trechos de rua esburacados ou errados no mapa — a rota nunca mais vai
              passar por ali.
            </p>
            {avoidPoints.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {avoidPoints.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-coffee/10 px-3 py-2 text-sm"
                  >
                    <span className="text-coffee-soft">
                      Ponto {i + 1} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </span>
                    <button onClick={() => removeAvoidPoint(p.id)} className="text-xs font-bold text-danger">
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setPickingAvoidPoint((v) => !v)}
              className={`min-h-11 self-start rounded-xl px-4 text-sm font-bold ${
                pickingAvoidPoint ? "bg-danger-bg text-danger" : "bg-cream-soft text-coffee-soft"
              }`}
            >
              {pickingAvoidPoint ? "Toque no mapa pra marcar (toque aqui pra cancelar)" : "Marcar rua no mapa"}
            </button>
          </>
        )}
      </section>

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

      {showMapSection && (
        <section className="overflow-hidden rounded-2xl bg-white">
          {routeResult && hasRoute && (
            <div className="flex flex-wrap items-center gap-4 border-b border-cream-soft px-4 py-3 text-sm font-bold text-coffee">
              <span>{formatDistance(routeResult.totalDistanceMeters)}</span>
              <span>{formatDuration(routeResult.totalDurationSeconds)}</span>
              {routeResult.returnGeometry && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-coffee/60">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#5b4636]" />
                  Volta
                </span>
              )}
            </div>
          )}
          <div className={`grid grid-cols-1 ${hasRoute ? "lg:grid-cols-[1fr_300px]" : ""}`}>
            <div className="relative">
              <div ref={mapContainerRef} className={`h-[380px] w-full ${hasRoute ? "lg:h-[520px]" : "lg:h-[600px]"}`} />

              {hasRoute && (
                <button
                  onClick={fitToRoute}
                  className="absolute left-3 top-3 min-h-9 rounded-lg bg-white/95 px-3 text-xs font-bold text-coffee shadow-md"
                >
                  Ver rota completa
                </button>
              )}

              {mapError && (
                <div className="absolute inset-x-3 top-3 rounded-lg bg-danger-bg px-3 py-2 text-xs font-semibold text-danger shadow-md">
                  {mapError}
                </div>
              )}

              {selectedStopData && (
                <div className="absolute bottom-3 left-3 right-3 flex items-start gap-2 rounded-xl bg-white p-3 shadow-lg sm:right-auto sm:max-w-xs">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange text-xs font-bold text-white">
                    {selectedStopData.stopIndex}
                  </span>
                  <div className="min-w-0 flex-1">
                    {selectedStopData.orders.map((o) => (
                      <p key={o.id} className="truncate text-sm font-bold text-coffee">
                        {o.customerName}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedStop(null)}
                    aria-label="Fechar"
                    className="shrink-0 text-coffee-soft"
                  >
                    ✕
                  </button>
                </div>
              )}

              {deliverySession && !hasRoute && (
                <p className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs text-coffee-soft shadow-md">
                  {deliverySession.status === "active"
                    ? "Mostrando a posição do motoboy ao vivo."
                    : "Assim que o motoboy iniciar pelo link, a posição aparece aqui."}
                </p>
              )}
            </div>

            {routeResult && hasRoute && (
              <div className="flex flex-col gap-0 border-t border-cream-soft p-3 lg:max-h-[520px] lg:overflow-y-auto lg:border-l lg:border-t-0">
                <h2 className="px-1 pb-2 text-base font-extrabold text-coffee">Rota planejada</h2>
                <p className="px-1 pb-3 text-xs font-semibold text-coffee-soft">
                  {routeResult.stops.length} parada{routeResult.stops.length === 1 ? "" : "s"}
                </p>

                <div className="flex gap-3 px-1 pb-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-coffee bg-white">
                      <span className="h-2.5 w-2.5 rounded-full bg-coffee" />
                    </span>
                    <span className="mt-0.5 w-px flex-1 border-l border-dashed border-coffee/20" />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-coffee">Saída · Cozinha</p>
                      {formatEta(routeResult.departureIso) && (
                        <span className="shrink-0 text-xs font-semibold text-coffee-soft">
                          {formatEta(routeResult.departureIso)}
                        </span>
                      )}
                    </div>
                    {kitchen?.address_street && (
                      <p className="truncate text-xs text-coffee-soft">{kitchen.address_street}</p>
                    )}
                  </div>
                </div>

                {routeResult.stops.map((stop, i) => (
                  <button
                    key={stop.stopIndex}
                    onClick={() => flyToStop(stop.stopIndex)}
                    className={`flex gap-3 rounded-lg px-1 py-1.5 text-left transition-colors ${
                      selectedStop === stop.stopIndex ? "bg-orange-soft/40" : "hover:bg-cream-soft"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: legColor(stop.stopIndex) }}
                      >
                        {stop.stopIndex}
                      </span>
                      {i < routeResult.stops.length - 1 && (
                        <span className="mt-0.5 w-px flex-1 border-l border-dashed border-coffee/20" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-coffee">
                          {stop.orders.map((o) => o.customerName).join(" + ")}
                        </p>
                        {formatEta(stop.etaIso) && (
                          <span className="shrink-0 text-xs font-semibold text-coffee-soft">
                            {formatEta(stop.etaIso)}
                          </span>
                        )}
                      </div>
                      {stop.orders.map((o) => (
                        <p key={o.id} className="truncate text-xs text-coffee-soft">
                          {o.address}
                          {o.items && <span> · {o.items}</span>}
                        </p>
                      ))}
                      {stopDeliveryInfo(stop)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
