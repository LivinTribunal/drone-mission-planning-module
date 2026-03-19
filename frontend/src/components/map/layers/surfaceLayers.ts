import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";

export const RUNWAY_SOURCE = "runways";
export const RUNWAY_LAYER = "runways-line";
export const TAXIWAY_SOURCE = "taxiways";
export const TAXIWAY_LAYER = "taxiways-line";

export function addSurfaceLayers(
  map: MaplibreMap,
  surfaces: SurfaceResponse[],
): string[] {
  const runways = surfaces.filter((s) => s.surface_type === "RUNWAY");
  const taxiways = surfaces.filter(
    (s) => s.surface_type === "TAXIWAY" || s.surface_type === "APRON",
  );

  // runways
  map.addSource(RUNWAY_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: runways.map((r) => ({
        type: "Feature" as const,
        properties: {
          id: r.id,
          identifier: r.identifier,
          width: r.width ?? 45,
          entityType: "surface",
        },
        geometry: r.geometry,
      })),
    },
  });

  map.addLayer({
    id: RUNWAY_LAYER,
    type: "line",
    source: RUNWAY_SOURCE,
    paint: {
      "line-color": "#3bbb3b",
      "line-width": 6,
      "line-opacity": 0.8,
    },
  });

  // taxiways
  map.addSource(TAXIWAY_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: taxiways.map((t) => ({
        type: "Feature" as const,
        properties: {
          id: t.id,
          identifier: t.identifier,
          width: t.taxiway_width ?? 20,
          entityType: "surface",
        },
        geometry: t.geometry,
      })),
    },
  });

  map.addLayer({
    id: TAXIWAY_LAYER,
    type: "line",
    source: TAXIWAY_SOURCE,
    paint: {
      "line-color": "#e5a545",
      "line-width": 3,
      "line-opacity": 0.7,
    },
  });

  return [RUNWAY_LAYER, TAXIWAY_LAYER];
}
