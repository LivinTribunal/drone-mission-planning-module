import type { Map as MaplibreMap } from "maplibre-gl";
import type { SurfaceResponse } from "@/types/airport";
import { DEFAULT_TAXIWAY_WIDTH_M } from "@/constants/surface";

export const RUNWAY_SOURCE = "runways";
export const RUNWAY_POLYGON_SOURCE = "runways-polygon";
export const RUNWAY_FILL_LAYER = "runways-fill";
export const RUNWAY_STROKE_LAYER = "runways-stroke";
export const RUNWAY_CENTERLINE_LAYER = "runways-centerline";
export const RUNWAY_LABEL_LAYER = "runways-label";
export const TAXIWAY_SOURCE = "taxiways";
export const TAXIWAY_POLYGON_SOURCE = "taxiways-polygon";
export const TAXIWAY_FILL_LAYER = "taxiways-fill";
export const TAXIWAY_STROKE_LAYER = "taxiways-stroke";
export const TAXIWAY_CENTERLINE_LAYER = "taxiways-centerline";
export const TAXIWAY_LABEL_LAYER = "taxiways-label";
export const TOUCHPOINT_SOURCE = "runway-touchpoints";
export const TOUCHPOINT_MARKER_LAYER = "runway-touchpoints-marker";
export const TOUCHPOINT_LABEL_LAYER = "runway-touchpoints-label";
export const THRESHOLD_SOURCE = "runway-thresholds";
export const THRESHOLD_MARKER_LAYER = "runway-thresholds-marker";
export const THRESHOLD_LABEL_LAYER = "runway-thresholds-label";
export const END_POSITION_SOURCE = "runway-end-positions";
export const END_POSITION_MARKER_LAYER = "runway-end-positions-marker";
export const END_POSITION_LABEL_LAYER = "runway-end-positions-label";

// keep old names as aliases for backwards compat in layerGroupMap
export const RUNWAY_LAYER = RUNWAY_FILL_LAYER;
export const TAXIWAY_LAYER = TAXIWAY_FILL_LAYER;

const EARTH_RADIUS = 6371000;

/** buffers a linestring centerline by half-width in meters to produce a polygon. */
export function bufferLineString(
  coordinates: number[][],
  widthMeters: number,
): number[][] {
  if (coordinates.length < 2) return [];

  const half = widthMeters / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < coordinates.length; i++) {
    const [lon, lat] = coordinates[i];

    // compute perpendicular direction from segment heading
    let dx: number, dy: number;
    if (i < coordinates.length - 1) {
      dx = coordinates[i + 1][0] - lon;
      dy = coordinates[i + 1][1] - lat;
    } else {
      dx = lon - coordinates[i - 1][0];
      dy = lat - coordinates[i - 1][1];
    }

    // convert direction to meters so perpendicular is geographically correct
    const latRad = (lat * Math.PI) / 180;
    const mPerDegLon = (Math.PI / 180) * EARTH_RADIUS * Math.cos(latRad);
    const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS;

    const dxM = dx * mPerDegLon;
    const dyM = dy * mPerDegLat;
    const lenM = Math.sqrt(dxM * dxM + dyM * dyM);

    // coincident points - reuse previous offset to keep left/right arrays aligned
    if (lenM === 0) {
      if (left.length > 0) {
        left.push(left[left.length - 1]);
        right.push(right[right.length - 1]);
      } else {
        left.push([lon, lat]);
        right.push([lon, lat]);
      }
      continue;
    }

    // perpendicular unit vector in metric space (rotated 90 degrees)
    const perpXM = -dyM / lenM;
    const perpYM = dxM / lenM;

    // convert meter offset back to degrees
    const offsetLon = (perpXM * half) / mPerDegLon;
    const offsetLat = (perpYM * half) / mPerDegLat;

    left.push([lon + offsetLon, lat + offsetLat]);
    right.push([lon - offsetLon, lat - offsetLat]);
  }

  // close the polygon: left side forward, right side reversed
  if (left.length === 0) return [];
  right.reverse();
  const ring = [...left, ...right, left[0]];
  return ring;
}

/** adds runway and taxiway layers with geographic polygon fills. */
export function addSurfaceLayers(
  map: MaplibreMap,
  surfaces: SurfaceResponse[],
): string[] {
  const runways = surfaces.filter((s) => s.surface_type === "RUNWAY");
  const taxiways = surfaces.filter((s) => s.surface_type === "TAXIWAY");

  // centerline source for labels and centerline dashes
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

  // polygon source for geographic fill - use stored boundary when available
  map.addSource(RUNWAY_POLYGON_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: runways
        .filter((r) => r.boundary || r.geometry.coordinates.length >= 2)
        .map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.id,
            identifier: r.identifier,
            entityType: "surface",
          },
          geometry: r.boundary ?? {
            type: "Polygon" as const,
            coordinates: [bufferLineString(r.geometry.coordinates, r.width ?? 45)],
          },
        })),
    },
  });

  // runway stroke - geographic polygon outline
  map.addLayer({
    id: RUNWAY_STROKE_LAYER,
    type: "line",
    source: RUNWAY_POLYGON_SOURCE,
    paint: {
      "line-color": "#6a6a6a",
      "line-width": 1.5,
      "line-opacity": 0.6,
    },
  });

  // runway fill - geographic polygon
  map.addLayer({
    id: RUNWAY_FILL_LAYER,
    type: "fill",
    source: RUNWAY_POLYGON_SOURCE,
    paint: {
      "fill-color": "#4a4a4a",
      "fill-opacity": 0.5,
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

  // taxiway centerline source for labels
  map.addSource(TAXIWAY_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: taxiways.map((t) => ({
        type: "Feature" as const,
        properties: {
          id: t.id,
          identifier: t.identifier,
          width: DEFAULT_TAXIWAY_WIDTH_M,
          entityType: "surface",
        },
        geometry: t.geometry,
      })),
    },
  });

  // taxiway polygon source for geographic fill - use stored boundary when available
  map.addSource(TAXIWAY_POLYGON_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: taxiways
        .filter((t) => t.boundary || t.geometry.coordinates.length >= 2)
        .map((t) => ({
          type: "Feature" as const,
          properties: {
            id: t.id,
            identifier: t.identifier,
            entityType: "surface",
          },
          geometry: t.boundary ?? {
            type: "Polygon" as const,
            coordinates: [bufferLineString(t.geometry.coordinates, DEFAULT_TAXIWAY_WIDTH_M)],
          },
        })),
    },
  });

  // taxiway stroke - geographic polygon outline
  map.addLayer({
    id: TAXIWAY_STROKE_LAYER,
    type: "line",
    source: TAXIWAY_POLYGON_SOURCE,
    paint: {
      "line-color": "#b8a038",
      "line-width": 1,
      "line-opacity": 0.5,
    },
  });

  // taxiway fill - geographic polygon
  map.addLayer({
    id: TAXIWAY_FILL_LAYER,
    type: "fill",
    source: TAXIWAY_POLYGON_SOURCE,
    paint: {
      "fill-color": "#c8a83c",
      "fill-opacity": 0.35,
    },
  });

  // taxiway centerline dashes
  map.addLayer({
    id: TAXIWAY_CENTERLINE_LAYER,
    type: "line",
    source: TAXIWAY_SOURCE,
    paint: {
      "line-color": "#1a1a1a",
      "line-width": 1,
      "line-dasharray": [6, 6],
      "line-opacity": 0.6,
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
      "text-color": "#d4b84a",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  // runway touchpoint markers - yellow diamond labelled "TDP"
  const touchpoints = runways.filter(
    (r) => r.touchpoint_latitude != null && r.touchpoint_longitude != null,
  );
  if (touchpoints.length > 0) {
    map.addSource(TOUCHPOINT_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: touchpoints.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.id,
            identifier: r.identifier,
            entityType: "touchpoint",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [
              r.touchpoint_longitude as number,
              r.touchpoint_latitude as number,
              r.touchpoint_altitude ?? 0,
            ],
          },
        })),
      },
    });

    map.addLayer({
      id: TOUCHPOINT_MARKER_LAYER,
      type: "circle",
      source: TOUCHPOINT_SOURCE,
      paint: {
        "circle-radius": 8,
        "circle-color": "#ffd700",
        "circle-stroke-color": "#000000",
        "circle-stroke-width": 1,
        "circle-opacity": 0.9,
      },
    });

    map.addLayer({
      id: TOUCHPOINT_LABEL_LAYER,
      type: "symbol",
      source: TOUCHPOINT_SOURCE,
      layout: {
        "text-field": "TDP",
        "text-size": 10,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#ffd700",
        "text-halo-color": "#000000",
        "text-halo-width": 1.5,
      },
    });
  }

  // runway threshold markers
  const thresholds = runways.filter((r) => r.threshold_position != null);
  if (thresholds.length > 0) {
    map.addSource(THRESHOLD_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: thresholds.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.id,
            identifier: r.identifier,
            entityType: "threshold",
          },
          geometry: r.threshold_position!,
        })),
      },
    });

    map.addLayer({
      id: THRESHOLD_MARKER_LAYER,
      type: "symbol",
      source: THRESHOLD_SOURCE,
      layout: {
        "icon-image": "threshold-marker",
        "icon-size": 0.9,
        "icon-allow-overlap": true,
      },
    });

    map.addLayer({
      id: THRESHOLD_LABEL_LAYER,
      type: "symbol",
      source: THRESHOLD_SOURCE,
      layout: {
        "text-field": "THR",
        "text-size": 10,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#4595e5",
        "text-halo-color": "#000000",
        "text-halo-width": 1.5,
      },
    });
  }

  // runway end position markers
  const endPositions = runways.filter((r) => r.end_position != null);
  if (endPositions.length > 0) {
    map.addSource(END_POSITION_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: endPositions.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.id,
            identifier: r.identifier,
            entityType: "end_position",
          },
          geometry: r.end_position!,
        })),
      },
    });

    map.addLayer({
      id: END_POSITION_MARKER_LAYER,
      type: "symbol",
      source: END_POSITION_SOURCE,
      layout: {
        "icon-image": "end-position-marker",
        "icon-size": 0.9,
        "icon-allow-overlap": true,
      },
    });

    map.addLayer({
      id: END_POSITION_LABEL_LAYER,
      type: "symbol",
      source: END_POSITION_SOURCE,
      layout: {
        "text-field": "END",
        "text-size": 10,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#e54545",
        "text-halo-color": "#000000",
        "text-halo-width": 1.5,
      },
    });
  }

  const layers = [
    RUNWAY_STROKE_LAYER,
    RUNWAY_FILL_LAYER,
    RUNWAY_CENTERLINE_LAYER,
    RUNWAY_LABEL_LAYER,
    TAXIWAY_STROKE_LAYER,
    TAXIWAY_FILL_LAYER,
    TAXIWAY_CENTERLINE_LAYER,
    TAXIWAY_LABEL_LAYER,
  ];
  if (touchpoints.length > 0) {
    layers.push(TOUCHPOINT_MARKER_LAYER, TOUCHPOINT_LABEL_LAYER);
  }
  if (thresholds.length > 0) {
    layers.push(THRESHOLD_MARKER_LAYER, THRESHOLD_LABEL_LAYER);
  }
  if (endPositions.length > 0) {
    layers.push(END_POSITION_MARKER_LAYER, END_POSITION_LABEL_LAYER);
  }
  return layers;
}
