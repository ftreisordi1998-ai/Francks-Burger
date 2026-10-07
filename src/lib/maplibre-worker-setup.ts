import { getVersion, setWorkerUrl } from "maplibre-gl";

// Turbopack (o bundler do Next.js) não consegue empacotar o worker interno do
// MapLibre corretamente — carregá-lo de um CDN é a correção recomendada pela
// própria comunidade do MapLibre para esse bug conhecido com o Turbopack.
let configured = false;

export function ensureMaplibreWorker() {
  if (configured || typeof window === "undefined") return;
  configured = true;
  setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${getVersion()}/dist/maplibre-gl-worker.mjs`);
}
