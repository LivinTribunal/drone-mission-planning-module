import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";

export const AGL_SOURCE = "agls";
export const AGL_POINT_LAYER = "agls-point";
export const AGL_LABEL_LAYER = "agls-label";
export const LHA_SOURCE = "lhas";
export const LHA_POINT_LAYER = "lhas-point";
export const LHA_LABEL_LAYER = "lhas-label";
export const EDGE_LIGHTS_LINE_SOURCE = "edge-lights-line";
export const EDGE_LIGHTS_LINE_LAYER = "edge-lights-line-layer";

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
      "icon-size": 1.0,
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

  // lha markers - visible only when zoomed in. edge-light LHAs render smaller
  // and have a thin connecting line drawn across the full row.
  if (lhas.length > 0) {
    const edgeLightAglIds = new Set(
      agls.filter((a) => a.agl_type === "RUNWAY_EDGE_LIGHTS").map((a) => a.id),
    );
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
            aglType: edgeLightAglIds.has(l.agl_id) ? "RUNWAY_EDGE_LIGHTS" : "PAPI",
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
        "circle-radius": [
          "case",
          ["==", ["get", "aglType"], "RUNWAY_EDGE_LIGHTS"],
          4,
          6,
        ],
        "circle-color": "#e91e90",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
      },
    });

    // lha labels - suppressed for edge lights (too noisy for a long row)
    map.addLayer({
      id: LHA_LABEL_LAYER,
      type: "symbol",
      source: LHA_SOURCE,
      filter: ["!=", ["get", "aglType"], "RUNWAY_EDGE_LIGHTS"],
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

  // connecting line across edge-light rows for at-a-glance orientation
  const edgeLightLines = agls
    .filter((a) => a.agl_type === "RUNWAY_EDGE_LIGHTS" && a.lhas.length >= 2)
    .map((a) => {
      const ordered = [...a.lhas].sort((x, y) => x.unit_number - y.unit_number);
      const first = ordered[0].position.coordinates;
      const last = ordered[ordered.length - 1].position.coordinates;
      return {
        type: "Feature" as const,
        properties: { id: a.id, entityType: "agl-edge-line" },
        geometry: {
          type: "LineString" as const,
          coordinates: [first, last],
        },
      };
    });

  if (edgeLightLines.length > 0) {
    map.addSource(EDGE_LIGHTS_LINE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: edgeLightLines },
    });
    map.addLayer({
      id: EDGE_LIGHTS_LINE_LAYER,
      type: "line",
      source: EDGE_LIGHTS_LINE_SOURCE,
      paint: {
        "line-color": "#e91e90",
        "line-width": 1,
        "line-opacity": 0.3,
      },
    });
  }

  const layers = [AGL_POINT_LAYER, AGL_LABEL_LAYER];
  if (lhas.length > 0) {
    layers.push(LHA_POINT_LAYER, LHA_LABEL_LAYER);
  }
  if (edgeLightLines.length > 0) {
    layers.push(EDGE_LIGHTS_LINE_LAYER);
  }
  return layers;
}
