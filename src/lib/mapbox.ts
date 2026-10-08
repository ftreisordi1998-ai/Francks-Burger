import type { GeocodeCandidate } from "./types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Limite real do Mapbox para Matrix/Directions no perfil "driving": 25 coordenadas
// por requisição (cozinha + paradas). Acima disso a API recusa a chamada.
export const MAPBOX_MAX_COORDINATES = 25;

function requireToken(): string {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_NOT_CONFIGURED");
  return MAPBOX_TOKEN;
}

/** Geocodifica um endereço em Uraí/PR. Usa o modo "permanent" porque guardamos
 * o resultado no pedido (cache), o que é permitido pelos termos do Mapbox para
 * uso próprio/comercial (não redistribuição). */
export async function geocodeAddress(query: string): Promise<GeocodeCandidate[]> {
  const token = requireToken();
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?country=br&language=pt&limit=3&permanent=true&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("GEOCODE_REQUEST_FAILED");
  const data = await res.json();
  type Feature = { center: [number, number]; place_name: string; relevance: number };
  return ((data.features ?? []) as Feature[]).map((f) => ({
    lat: f.center[1],
    lng: f.center[0],
    placeName: f.place_name,
    relevance: f.relevance,
  }));
}

// Mapbox aceita no máximo 50 pontos de exclusão por requisição (perfis
// driving/driving-traffic), cada um "puxado" pra rua mais próxima e então
// excluído do roteamento — é assim que marcamos uma rua específica (ex: rua
// esburacada ou com dado de mapa errado) pra nunca ser usada.
function excludeParam(avoidPoints?: { lat: number; lng: number }[]): string {
  if (!avoidPoints || avoidPoints.length === 0) return "";
  const capped = avoidPoints.slice(0, 50);
  const points = capped.map((p) => `point(${p.lng} ${p.lat})`).join(",");
  return `&exclude=${encodeURIComponent(points)}`;
}

/** Matriz de distância/tempo real pelas ruas entre todos os pontos (índice 0 =
 * cozinha). Nunca usa linha reta. */
export async function drivingMatrix(
  points: { lat: number; lng: number }[],
  avoidPoints?: { lat: number; lng: number }[]
): Promise<{ distances: number[][]; durations: number[][] }> {
  const token = requireToken();
  if (points.length > MAPBOX_MAX_COORDINATES) {
    throw new Error("TOO_MANY_STOPS");
  }
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
    `?annotations=distance,duration&access_token=${token}${excludeParam(avoidPoints)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("MATRIX_REQUEST_FAILED");
  const data = await res.json();
  if (!data.distances || !data.durations) throw new Error("MATRIX_REQUEST_FAILED");
  return { distances: data.distances, durations: data.durations };
}

/** Geometria real da rota (pelas ruas) na ordem final das paradas. */
export async function drivingDirections(
  points: { lat: number; lng: number }[],
  avoidPoints?: { lat: number; lng: number }[]
): Promise<{
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
  durationSeconds: number;
}> {
  const token = requireToken();
  if (points.length > MAPBOX_MAX_COORDINATES) {
    throw new Error("TOO_MANY_STOPS");
  }
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${token}${excludeParam(avoidPoints)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("DIRECTIONS_REQUEST_FAILED");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("DIRECTIONS_REQUEST_FAILED");
  return {
    geometry: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
