import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";
import { formatAglDisplayName } from "@/utils/agl";
import { aglColorForType } from "@/utils/aglColor";

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
  const aglsWithSurface = surfaces.flatMap((s) =>
    s.agls.map((a) => ({ agl: a, surface: s })),
  );
  const agls = aglsWithSurface.map((x) => x.agl);
  const lhas = agls.flatMap((a) => a.lhas);

  map.addSource(AGL_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: aglsWithSurface.map(({ agl: a, surface: s }) => ({
        type: "Feature" as const,
        properties: {
          id: a.id,
          displayName: formatAglDisplayName(a, s),
          aglType: a.agl_type,
          entityType: "agl",
          color: aglColorForType(a.agl_type),
        },
        geometry: a.position,
      })),
    },
  });

  // agl markers - colored circle per agl system
  map.addLayer({
    id: AGL_POINT_LAYER,
    type: "circle",
    source: AGL_SOURCE,
    paint: {
      "circle-radius": 7,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15, 0.4],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15, 0.4],
    },
  });

  // agl labels
  map.addLayer({
    id: AGL_LABEL_LAYER,
    type: "symbol",
    source: AGL_SOURCE,
    layout: {
      "text-field": ["get", "displayName"],
      "text-size": 11,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-offset": [0, 1.5],
      "text-anchor": "top",
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  // lha markers - visible only when zoomed in. edge-light LHAs render smaller
  // and have a thin connecting line drawn across the full row.
  if (lhas.length > 0) {
    const aglTypeMap = new Map(agls.map((a) => [a.id, a.agl_type]));
    map.addSource(LHA_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: lhas.map((l) => ({
          type: "Feature" as const,
          properties: {
            id: l.id,
            unitNumber: l.unit_number,
            settingAngle: l.setting_angle ?? 0,
            hasSettingAngle: l.setting_angle != null,
            lampType: l.lamp_type,
            aglType: aglTypeMap.get(l.agl_id) ?? "PAPI",
            entityType: "lha",
            color: aglColorForType(aglTypeMap.get(l.agl_id)),
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
        "circle-color": ["get", "color"],
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
        // hide "(°)" for papi lhas with no setting_angle set yet
        "text-field": [
          "concat",
          "LHA ",
          ["to-string", ["get", "unitNumber"]],
          [
            "case",
            ["get", "hasSettingAngle"],
            [
              "concat",
              " (",
              ["to-string", ["get", "settingAngle"]],
              "\u00B0)",
            ],
            "",
          ],
        ],
        "text-size": 10,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["get", "color"],
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
        properties: {
          id: a.id,
          entityType: "agl-edge-line",
          color: aglColorForType(a.agl_type),
        },
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
        "line-color": ["get", "color"],
        "line-width": 1.5,
        "line-opacity": 0.5,
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
