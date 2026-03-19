import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";

export const AGL_SOURCE = "agls";
export const AGL_POINT_LAYER = "agls-point";
export const AGL_LABEL_LAYER = "agls-label";
export const LHA_SOURCE = "lhas";
export const LHA_POINT_LAYER = "lhas-point";

export function addAglLayers(
  map: MaplibreMap,
  surfaces: SurfaceResponse[],
): string[] {
  const agls = surfaces.flatMap((s) => s.agls);
  const lhas = agls.flatMap((a) => a.lhas);

  map.addSource(AGL_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: agls.map((a) => ({
        type: "Feature" as const,
        properties: {
          id: a.id,
          name: a.name,
          aglType: a.agl_type,
          entityType: "agl",
        },
        geometry: a.position,
      })),
    },
  });

  // zoom-dependent opacity: opaque when zoomed out, semi-transparent when zoomed in
  map.addLayer({
    id: AGL_POINT_LAYER,
    type: "circle",
    source: AGL_SOURCE,
    paint: {
      "circle-radius": 7,
      "circle-color": "#4595e5",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 16, 1, 17, 0.3],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 16, 1, 17, 0.3],
    },
  });

  map.addLayer({
    id: AGL_LABEL_LAYER,
    type: "symbol",
    source: AGL_SOURCE,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#4595e5",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  // lha markers - visible only when zoomed in
  if (lhas.length > 0) {
    map.addSource(LHA_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: lhas.map((l) => ({
          type: "Feature" as const,
          properties: {
            id: l.id,
            unitNumber: l.unit_number,
            lampType: l.lamp_type,
            entityType: "lha",
          },
          geometry: l.position,
        })),
      },
    });

    map.addLayer({
      id: LHA_POINT_LAYER,
      type: "circle",
      source: LHA_SOURCE,
      paint: {
        "circle-radius": 4,
        "circle-color": "#60a5fa",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 17, 1],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 17, 1],
      },
    });
  }

  return lhas.length > 0
    ? [AGL_POINT_LAYER, AGL_LABEL_LAYER, LHA_POINT_LAYER]
    : [AGL_POINT_LAYER, AGL_LABEL_LAYER];
}
