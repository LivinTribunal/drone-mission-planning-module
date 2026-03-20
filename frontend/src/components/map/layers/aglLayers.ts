import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";

export const AGL_SOURCE = "agls";
export const AGL_POINT_LAYER = "agls-point";
export const AGL_LABEL_LAYER = "agls-label";
export const LHA_SOURCE = "lhas";
export const LHA_POINT_LAYER = "lhas-point";
export const LHA_LABEL_LAYER = "lhas-label";

/** adds agl system and lha unit layers with green markers and labels. */
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

  // agl square markers
  map.addLayer({
    id: AGL_POINT_LAYER,
    type: "symbol",
    source: AGL_SOURCE,
    layout: {
      "icon-image": "agl-square",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 1.2],
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15, 0.3],
    },
  });

  // agl labels
  map.addLayer({
    id: AGL_LABEL_LAYER,
    type: "symbol",
    source: AGL_SOURCE,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-offset": [0, 1.5],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#e91e90",
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
            settingAngle: l.setting_angle,
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
        "circle-radius": 6,
        "circle-color": "#e91e90",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
      },
    });

    // lha labels
    map.addLayer({
      id: LHA_LABEL_LAYER,
      type: "symbol",
      source: LHA_SOURCE,
      layout: {
        "text-field": [
          "concat",
          "LHA ",
          ["to-string", ["get", "unitNumber"]],
          " (",
          ["to-string", ["get", "settingAngle"]],
          "\u00B0)",
        ],
        "text-size": 10,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#e91e90",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
      },
    });
  }

  const layers = [AGL_POINT_LAYER, AGL_LABEL_LAYER];
  if (lhas.length > 0) {
    layers.push(LHA_POINT_LAYER, LHA_LABEL_LAYER);
  }
  return layers;
}
