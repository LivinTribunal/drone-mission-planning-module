import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";

export const RUNWAY_SOURCE = "runways";
export const RUNWAY_FILL_LAYER = "runways-fill";
export const RUNWAY_STROKE_LAYER = "runways-stroke";
export const RUNWAY_CENTERLINE_LAYER = "runways-centerline";
export const RUNWAY_LABEL_LAYER = "runways-label";
export const TAXIWAY_SOURCE = "taxiways";
export const TAXIWAY_FILL_LAYER = "taxiways-fill";
export const TAXIWAY_STROKE_LAYER = "taxiways-stroke";
export const TAXIWAY_LABEL_LAYER = "taxiways-label";

// keep old names as aliases for backwards compat in layerGroupMap
export const RUNWAY_LAYER = RUNWAY_FILL_LAYER;
export const TAXIWAY_LAYER = TAXIWAY_FILL_LAYER;

/** adds runway and taxiway layers with aviation-chart styling. */
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

  // runway stroke (wider, underneath)
  map.addLayer({
    id: RUNWAY_STROKE_LAYER,
    type: "line",
    source: RUNWAY_SOURCE,
    paint: {
      "line-color": "#6a6a6a",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12, 4,
        15, ["*", ["get", "width"], 0.3],
        18, ["*", ["get", "width"], 1.2],
      ],
      "line-opacity": 0.6,
    },
    layout: {
      "line-cap": "butt",
    },
  });

  // runway fill
  map.addLayer({
    id: RUNWAY_FILL_LAYER,
    type: "line",
    source: RUNWAY_SOURCE,
    paint: {
      "line-color": "#4a4a4a",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12, 3,
        15, ["*", ["get", "width"], 0.25],
        18, ["*", ["get", "width"], 1],
      ],
      "line-opacity": 0.6,
    },
    layout: {
      "line-cap": "butt",
    },
  });

  // runway centerline dashes
  map.addLayer({
    id: RUNWAY_CENTERLINE_LAYER,
    type: "line",
    source: RUNWAY_SOURCE,
    paint: {
      "line-color": "#ffffff",
      "line-width": 1.5,
      "line-dasharray": [8, 8],
      "line-opacity": 0.7,
    },
  });

  // runway labels
  map.addLayer({
    id: RUNWAY_LABEL_LAYER,
    type: "symbol",
    source: RUNWAY_SOURCE,
    layout: {
      "text-field": ["concat", "RWY ", ["get", "identifier"]],
      "text-size": 13,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "symbol-placement": "line-center",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
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

  // taxiway stroke
  map.addLayer({
    id: TAXIWAY_STROKE_LAYER,
    type: "line",
    source: TAXIWAY_SOURCE,
    paint: {
      "line-color": "#5a7a5a",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12, 2,
        15, ["*", ["get", "width"], 0.2],
        18, ["*", ["get", "width"], 0.8],
      ],
      "line-opacity": 0.4,
    },
    layout: {
      "line-cap": "butt",
    },
  });

  // taxiway fill
  map.addLayer({
    id: TAXIWAY_FILL_LAYER,
    type: "line",
    source: TAXIWAY_SOURCE,
    paint: {
      "line-color": "#3a5a3a",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12, 1.5,
        15, ["*", ["get", "width"], 0.15],
        18, ["*", ["get", "width"], 0.6],
      ],
      "line-opacity": 0.4,
    },
    layout: {
      "line-cap": "butt",
    },
  });

  // taxiway labels
  map.addLayer({
    id: TAXIWAY_LABEL_LAYER,
    type: "symbol",
    source: TAXIWAY_SOURCE,
    layout: {
      "text-field": ["concat", "TWY ", ["get", "identifier"]],
      "text-size": 11,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "symbol-placement": "line-center",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#8a8a8a",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  return [
    RUNWAY_STROKE_LAYER,
    RUNWAY_FILL_LAYER,
    RUNWAY_CENTERLINE_LAYER,
    RUNWAY_LABEL_LAYER,
    TAXIWAY_STROKE_LAYER,
    TAXIWAY_FILL_LAYER,
    TAXIWAY_LABEL_LAYER,
  ];
}
