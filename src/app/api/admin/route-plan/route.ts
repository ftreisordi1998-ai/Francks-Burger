import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { drivingDirections, drivingMatrix, geocodeAddress, MAPBOX_MAX_COORDINATES } from "@/lib/mapbox";
import { solveRouteOrder } from "@/lib/route-optimize";
import type { GeocodeStatus, RouteOrderRow, RouteStop } from "@/lib/types";

const GEOCODE_RELEVANCE_THRESHOLD = 0.7;

function buildAddressQuery(order: RouteOrderRow): string {
  const parts = [
    [order.address_street, order.address_number].filter(Boolean).join(", "),
    order.neighborhood_name_snapshot,
    "Uraí",
    "Paraná",
    "Brasil",
  ].filter(Boolean);
  return parts.join(", ");
}

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export async function POST(req: NextRequest) {
  const { ok, supabase } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { orderIds, roundTrip } = (await req.json()) as { orderIds: string[]; roundTrip: boolean };
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "NO_ORDERS_SELECTED" }, { status: 400 });
  }

  const { data: kitchen } = await supabase
    .from("kitchen_location")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (!kitchen || !kitchen.confirmed_at || kitchen.lat === null || kitchen.lng === null) {
    return NextResponse.json({ error: "KITCHEN_NOT_CONFIGURED" }, { status: 400 });
  }

  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select(
      "id, customer_name, whatsapp, address_street, address_number, address_complement, address_reference, neighborhood_name_snapshot, address_lat, address_lng, address_geocode_status, order_items(product_name_snapshot, qty)"
    )
    .in("id", orderIds);
  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 400 });
  const orders = (ordersData ?? []) as unknown as RouteOrderRow[];

  // Geocodifica (e guarda em cache) qualquer pedido que ainda não tenha coordenada.
  const failedOrders: { id: string; customerName: string; reason: GeocodeStatus }[] = [];
  for (const order of orders) {
    if (order.address_lat !== null && order.address_lng !== null && order.address_geocode_status) {
      continue;
    }
    try {
      const candidates = await geocodeAddress(buildAddressQuery(order));
      const best = candidates[0];
      const status: GeocodeStatus =
        best && best.relevance >= GEOCODE_RELEVANCE_THRESHOLD ? "ok" : "ambiguous";
      await supabase
        .from("orders")
        .update({
          address_lat: best?.lat ?? null,
          address_lng: best?.lng ?? null,
          address_geocode_status: status,
        })
        .eq("id", order.id);
      order.address_lat = best?.lat ?? null;
      order.address_lng = best?.lng ?? null;
      order.address_geocode_status = status;
    } catch {
      await supabase
        .from("orders")
        .update({ address_geocode_status: "failed" })
        .eq("id", order.id);
      order.address_geocode_status = "failed";
    }
  }

  const routable = orders.filter(
    (o) =>
      (o.address_geocode_status === "ok" || o.address_geocode_status === "manual") &&
      o.address_lat !== null &&
      o.address_lng !== null
  );
  for (const o of orders) {
    if (!routable.includes(o)) {
      failedOrders.push({
        id: o.id,
        customerName: o.customer_name,
        reason: o.address_geocode_status ?? "failed",
      });
    }
  }

  if (routable.length === 0) {
    return NextResponse.json({
      stops: [],
      geometry: null,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      failedOrders,
    });
  }

  // Agrupa pedidos no mesmo endereço confirmado em uma única parada.
  const groups = new Map<
    string,
    { lat: number; lng: number; orders: { id: string; customerName: string; items: string }[] }
  >();
  for (const o of routable) {
    const lat = roundCoord(o.address_lat!);
    const lng = roundCoord(o.address_lng!);
    const key = `${lat},${lng}`;
    const itemsLabel = (o.order_items ?? []).map((i) => `${i.qty}× ${i.product_name_snapshot}`).join(", ");
    if (!groups.has(key)) {
      groups.set(key, { lat, lng, orders: [] });
    }
    groups.get(key)!.orders.push({ id: o.id, customerName: o.customer_name, items: itemsLabel });
  }
  const stopGroups = [...groups.values()];

  const points = [{ lat: kitchen.lat, lng: kitchen.lng }, ...stopGroups.map((g) => ({ lat: g.lat, lng: g.lng }))];
  if (points.length > MAPBOX_MAX_COORDINATES) {
    return NextResponse.json(
      {
        error: "TOO_MANY_STOPS",
        message: `Essa janela tem ${stopGroups.length} endereços diferentes — o limite por rota é ${MAPBOX_MAX_COORDINATES - 1}. Desmarque alguns pedidos e gere em dois grupos.`,
      },
      { status: 400 }
    );
  }

  let matrix: { distances: number[][]; durations: number[][] };
  try {
    matrix = await drivingMatrix(points);
  } catch (err) {
    const message = err instanceof Error ? err.message : "MATRIX_REQUEST_FAILED";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const solvedOrder = solveRouteOrder(matrix.durations, roundTrip);

  const orderedPoints = solvedOrder.map((idx) => points[idx]);
  const directionsPoints = roundTrip ? [...orderedPoints, points[0]] : orderedPoints;

  let directionsResult;
  try {
    directionsResult = await drivingDirections(directionsPoints);
  } catch (err) {
    const message = err instanceof Error ? err.message : "DIRECTIONS_REQUEST_FAILED";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const stops: RouteStop[] = solvedOrder
    .filter((idx) => idx !== 0)
    .map((idx, i) => {
      const group = stopGroups[idx - 1];
      return {
        stopIndex: i + 1,
        lat: group.lat,
        lng: group.lng,
        addressLabel: group.orders.map((o) => o.customerName).join(" + "),
        orders: group.orders,
      };
    });

  return NextResponse.json({
    stops,
    geometry: directionsResult.geometry,
    totalDistanceMeters: directionsResult.distanceMeters,
    totalDurationSeconds: directionsResult.durationSeconds,
    failedOrders,
  });
}
