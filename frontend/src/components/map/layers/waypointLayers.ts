import type maplibregl from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { WaypointResponse } from "@/types/flightPlan";
import type { PointZ } from "@/types/common";

export const WAYPOINT_SOURCE = "waypoints-source";
export const WAYPOINT_LINE_SOURCE = "waypoints-line-source";
export const WAYPOINT_TRANSIT_CIRCLE_LAYER = "waypoints-transit-circles";
export const WAYPOINT_MEASUREMENT_CIRCLE_LAYER = "waypoints-measurement-circles";
export const WAYPOINT_LABEL_LAYER = "waypoints-labels";
export const WAYPOINT_LINE_LAYER = "waypoints-line";
export const WAYPOINT_SELECTED_LAYER = "waypoints-selected";
export const WAYPOINT_TAKEOFF_LAYER = "waypoints-takeoff";
export const WAYPOINT_LANDING_LAYER = "waypoints-landing";
export const WAYPOINT_HOVER_LAYER = "waypoints-hover";
export const WAYPOINT_CAMERA_LINE_LAYER = "waypoints-camera-lines";
export const WAYPOINT_ARROW_LAYER = "waypoints-arrows";
export const WAYPOINT_CAMERA_TARGET_LAYER = "waypoints-camera-targets";
export const WAYPOINT_TRANSIT_HIT_LAYER = "waypoints-transit-hit";
export const WAYPOINT_GHOST_TRANSIT_SOURCE = "waypoints-ghost-transit";
export const WAYPOINT_GHOST_TRANSIT_LAYER = "waypoints-ghost-transit-layer";

export const SIMPLIFIED_LINE_SOURCE = "simplified-trajectory-source";
export const SIMPLIFIED_LINE_LAYER = "simplified-trajectory-line";
export const SIMPLIFIED_TAKEOFF_SOURCE = "simplified-takeoff-source";
export const SIMPLIFIED_LANDING_SOURCE = "simplified-landing-source";
export const SIMPLIFIED_TAKEOFF_LAYER = "simplified-takeoff";
export const SIMPLIFIED_LANDING_LAYER = "simplified-landing";
export const SIMPLIFIED_CORNERS_SOURCE = "simplified-corners-source";
export const SIMPLIFIED_MEASUREMENT_SOURCE = "simplified-measurement-source";
export const SIMPLIFIED_MEASUREMENT_LAYER = "simplified-measurement-dots";
export const SIMPLIFIED_CORNERS_LAYER = "simplified-corners";

const TRANSIT_PATH_COLOR = "#7eb8e5";
const DEFAULT_MEASUREMENT_COLOR = "#3bbb3b";

/** rounds a coordinate to ~0.1m precision for stack grouping. */
function coordKey(lon: number, lat: number): string {
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

/** converts waypoints + standalone markers to geojson points, collapsing vertical stacks. */
export function waypointsToGeoJSON(
  waypoints: WaypointResponse[],
  takeoff?: PointZ | null,
  landing?: PointZ | null,
  inspectionIndexMap?: Record<string, number>,
): GeoJSON.FeatureCollection {
  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );

  // non-stackable types get individual features
  const NON_STACKABLE = new Set(["TAKEOFF", "LANDING", "TRANSIT"]);
  const features: GeoJSON.Feature[] = [];
  const stackable: WaypointResponse[] = [];

  for (const wp of sorted) {
    // video start/stop hovers share position with measurements - skip on map,
    // they're visible in the waypoint list panel
    if (wp.waypoint_type === "HOVER" &&
        (wp.camera_action === "RECORDING_START" || wp.camera_action === "RECORDING_STOP")) {
      continue;
    }

    if (NON_STACKABLE.has(wp.waypoint_type)) {
      features.push({
        type: "Feature",
        properties: {
          id: wp.id,
          sequence_order: wp.sequence_order,
          waypoint_type: wp.waypoint_type,
          camera_action: wp.camera_action ?? "NONE",
          inspection_id: wp.inspection_id,
          label: resolveLabel(wp.waypoint_type, wp.inspection_id, inspectionIndexMap),
          color: resolveWaypointColor(wp.waypoint_type),
          has_camera_target: wp.camera_target ? "yes" : "no",
          stack_count: 1,
        },
        geometry: { type: "Point", coordinates: wp.position.coordinates },
      });
    } else {
      stackable.push(wp);
    }
  }

  // group stackable waypoints by ground position
  const stacks = new Map<string, WaypointResponse[]>();
  for (const wp of stackable) {
    const [lon, lat] = wp.position.coordinates;
    const key = coordKey(lon, lat);
    const group = stacks.get(key);
    if (group) {
      group.push(wp);
    } else {
      stacks.set(key, [wp]);
    }
  }

  for (const group of stacks.values()) {
    if (group.length === 1) {
      const wp = group[0];
      features.push({
        type: "Feature",
        properties: {
          id: wp.id,
          sequence_order: wp.sequence_order,
          waypoint_type: wp.waypoint_type,
          camera_action: wp.camera_action ?? "NONE",
          inspection_id: wp.inspection_id,
          label: resolveLabel(wp.waypoint_type, wp.inspection_id, inspectionIndexMap),
          color: resolveWaypointColor(wp.waypoint_type),
          has_camera_target: wp.camera_target ? "yes" : "no",
          stack_count: 1,
        },
        geometry: { type: "Point", coordinates: wp.position.coordinates },
      });
    } else {
      // collapsed stack - use first waypoint's position and color
      const first = group[0];
      const alts = group.map((w) => w.position.coordinates[2] ?? 0);
      const ids = group.map((w) => w.id).join(",");
      const seqs = group.map((w) => w.sequence_order);
      features.push({
        type: "Feature",
        properties: {
          id: ids,
          sequence_order: Math.min(...seqs),
          waypoint_type: first.waypoint_type,
          camera_action: first.camera_action ?? "NONE",
          inspection_id: first.inspection_id,
          label: resolveLabel(first.waypoint_type, first.inspection_id, inspectionIndexMap),
          color: resolveWaypointColor(first.waypoint_type),
          has_camera_target: "no",
          stack_count: group.length,
          seq_min: Math.min(...seqs),
          seq_max: Math.max(...seqs),
          alt_min: Math.min(...alts),
          alt_max: Math.max(...alts),
        },
        geometry: { type: "Point", coordinates: first.position.coordinates },
      });
    }
  }

  // standalone takeoff/landing when no trajectory waypoints
  if (waypoints.length === 0) {
    if (takeoff) {
      features.push({
        type: "Feature",
        properties: {
          id: "takeoff",
          sequence_order: 0,
          waypoint_type: "TAKEOFF",
          color: "#4595e5",
          stack_count: 1,
        },
        geometry: { type: "Point", coordinates: takeoff.coordinates },
      });
    }
    if (landing) {
      features.push({
        type: "Feature",
        properties: {
          id: "landing",
          sequence_order: 1,
          waypoint_type: "LANDING",
          color: "#e54545",
          stack_count: 1,
        },
        geometry: { type: "Point", coordinates: landing.coordinates },
      });
    }
  }

  return { type: "FeatureCollection", features };
}


/** creates a segment key from two coordinate pairs, sorted so both directions match. */
function segmentKey(a: number[], b: number[]): string {
  const ak = `${a[0].toFixed(6)},${a[1].toFixed(6)}`;
  const bk = `${b[0].toFixed(6)},${b[1].toFixed(6)}`;
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

/** offsets a line segment to the left of its heading by adding arc midpoints. */
function offsetSegmentLeft(
  from: number[],
  to: number[],
  meters: number,
): number[][] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [from, to];

  // left perpendicular in lon/lat space (rotated 90 degrees ccw)
  const perpLon = -dy / len;
  const perpLat = dx / len;

  // approximate degrees offset (~1 degree lat = 111km)
  const degOffset = meters / 111000;

  // three arc midpoints for a smooth curve
  const mid1Lon = from[0] + dx * 0.25 + perpLon * degOffset * 0.7;
  const mid1Lat = from[1] + dy * 0.25 + perpLat * degOffset * 0.7;
  const mid2Lon = from[0] + dx * 0.5 + perpLon * degOffset;
  const mid2Lat = from[1] + dy * 0.5 + perpLat * degOffset;
  const mid3Lon = from[0] + dx * 0.75 + perpLon * degOffset * 0.7;
  const mid3Lat = from[1] + dy * 0.75 + perpLat * degOffset * 0.7;

  const alt = ((from[2] ?? 0) + (to[2] ?? 0)) / 2;
  return [
    from,
    [mid1Lon, mid1Lat, alt],
    [mid2Lon, mid2Lat, alt],
    [mid3Lon, mid3Lat, alt],
    to,
  ];
}

/** builds line segments between consecutive waypoints, colored by type and phase. */
export function waypointsToLineGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );
  if (sorted.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  // first pass - count how many segments share each ground path
  const segmentCounts = new Map<string, number>();
  for (let i = 0; i < sorted.length - 1; i++) {
    const key = segmentKey(sorted[i].position.coordinates, sorted[i + 1].position.coordinates);
    segmentCounts.set(key, (segmentCounts.get(key) ?? 0) + 1);
  }

  // second pass - build features, offsetting overlapping segments
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const toType = to.waypoint_type;

    let color: string;
    if (toType === "TRANSIT" || toType === "TAKEOFF" || toType === "LANDING") {
      color = TRANSIT_PATH_COLOR;
    } else {
      color = resolveSegmentColor(toType);
    }

    const key = segmentKey(from.position.coordinates, to.position.coordinates);
    const isOverlapping = (segmentCounts.get(key) ?? 0) > 1;

    const coords = isOverlapping
      ? offsetSegmentLeft(from.position.coordinates, to.position.coordinates, 5)
      : [from.position.coordinates, to.position.coordinates];

    features.push({
      type: "Feature",
      properties: {
        color,
        inspection_id: to.inspection_id ?? null,
        from_seq: from.sequence_order,
        from_alt: from.position.coordinates[2] ?? 0,
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/** builds camera target lines from measurement waypoints. */
export function waypointsToCameraLineGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const wp of waypoints) {
    if (wp.camera_target && wp.waypoint_type === "MEASUREMENT") {
      features.push({
        type: "Feature",
        properties: { inspection_id: wp.inspection_id ?? null },
        geometry: {
          type: "LineString",
          coordinates: [
            wp.position.coordinates,
            wp.camera_target.coordinates,
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** builds camera target point features for map rendering. */
export function waypointsToCameraTargetGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const wp of waypoints) {
    if (wp.camera_target) {
      features.push({
        type: "Feature",
        properties: { id: wp.id, inspection_id: wp.inspection_id },
        geometry: { type: "Point", coordinates: wp.camera_target.coordinates },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** resolves color for a waypoint based on type. */
function resolveWaypointColor(type: string): string {
  if (type === "TAKEOFF") return "#4595e5";
  if (type === "LANDING") return "#e54545";
  if (type === "TRANSIT") return "#ffffff";
  if (type === "HOVER") return "#e5a545";
  return DEFAULT_MEASUREMENT_COLOR;
}

/** resolves color for a line segment leading to a waypoint. */
function resolveSegmentColor(toType: string): string {
  if (toType === "TRANSIT" || toType === "TAKEOFF" || toType === "LANDING") {
    return TRANSIT_PATH_COLOR;
  }
  return DEFAULT_MEASUREMENT_COLOR;
}

/** resolves the label text for a waypoint. */
function resolveLabel(
  type: string,
  inspectionId: string | null,
  indexMap?: Record<string, number>,
): string {
  if (type === "MEASUREMENT" && inspectionId && indexMap?.[inspectionId] !== undefined) {
    return String(indexMap[inspectionId]);
  }
  return "";
}

/** adds all waypoint layers to the map. */
export function addWaypointLayers(
  map: MaplibreMap,
  waypoints: WaypointResponse[],
  takeoff?: PointZ | null,
  landing?: PointZ | null,
  selectedWaypointId?: string | null,
  inspectionIndexMap?: Record<string, number>,
): void {
  const hasAny = waypoints.length > 0 || takeoff || landing;

  if (!hasAny) {
    removeWaypointLayers(map);
    return;
  }

  const pointData = waypointsToGeoJSON(waypoints, takeoff, landing, inspectionIndexMap);
  const lineData = waypointsToLineGeoJSON(waypoints);
  const cameraData = waypointsToCameraLineGeoJSON(waypoints);
  const cameraTargetData = waypointsToCameraTargetGeoJSON(waypoints);

  // update existing sources if present
  const existingSource = map.getSource(WAYPOINT_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (existingSource) {
    existingSource.setData(pointData);
    const lineSrc = map.getSource(WAYPOINT_LINE_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (lineSrc) lineSrc.setData(lineData);
    const cameraSrc = map.getSource("waypoints-camera-source") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (cameraSrc) cameraSrc.setData(cameraData);
    const cameraTargetSrc = map.getSource("waypoints-camera-target-source") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (cameraTargetSrc) cameraTargetSrc.setData(cameraTargetData);

    // update selected waypoint filter
    updateSelectedFilter(map, selectedWaypointId);
    return;
  }

  // add sources
  map.addSource(WAYPOINT_SOURCE, { type: "geojson", data: pointData });
  map.addSource(WAYPOINT_LINE_SOURCE, { type: "geojson", data: lineData });
  map.addSource("waypoints-camera-source", { type: "geojson", data: cameraData });

  // connecting lines - colored by segment type and phase
  map.addLayer({
    id: WAYPOINT_LINE_LAYER,
    type: "line",
    source: WAYPOINT_LINE_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 3,
      "line-opacity": 0.9,
    },
  });

  // transparent hit area for transit path insertion
  map.addLayer({
    id: WAYPOINT_TRANSIT_HIT_LAYER,
    type: "line",
    source: WAYPOINT_LINE_SOURCE,
    filter: ["==", ["get", "color"], TRANSIT_PATH_COLOR],
    paint: {
      "line-color": TRANSIT_PATH_COLOR,
      "line-width": 14,
      "line-opacity": 0,
    },
  });

  // ghost transit waypoint preview
  if (!map.getSource(WAYPOINT_GHOST_TRANSIT_SOURCE)) {
    map.addSource(WAYPOINT_GHOST_TRANSIT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: WAYPOINT_GHOST_TRANSIT_LAYER,
      type: "circle",
      source: WAYPOINT_GHOST_TRANSIT_SOURCE,
      paint: {
        "circle-radius": 6,
        "circle-color": TRANSIT_PATH_COLOR,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.6,
        "circle-stroke-opacity": 0.6,
      },
    });
  }

  // direction arrows along path segments
  map.addLayer({
    id: WAYPOINT_ARROW_LAYER,
    type: "symbol",
    source: WAYPOINT_LINE_SOURCE,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 80,
      "icon-image": "path-arrow",
      "icon-size": 0.6,
      "icon-allow-overlap": true,
      "icon-rotation-alignment": "map",
    },
    paint: {
      "icon-opacity": 0.85,
    },
  });

  // camera direction lines
  map.addLayer({
    id: WAYPOINT_CAMERA_LINE_LAYER,
    type: "line",
    source: "waypoints-camera-source",
    paint: {
      "line-color": "#ffffff",
      "line-width": 1,
      "line-opacity": 0.4,
      "line-dasharray": [3, 3],
    },
  });

  // camera target points
  map.addSource("waypoints-camera-target-source", { type: "geojson", data: cameraTargetData });
  map.addLayer({
    id: WAYPOINT_CAMERA_TARGET_LAYER,
    type: "circle",
    source: "waypoints-camera-target-source",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#e5a545",
      "circle-stroke-width": 2,
      "circle-opacity": 0.8,
    },
  });

  // transit waypoint circles
  map.addLayer({
    id: WAYPOINT_TRANSIT_CIRCLE_LAYER,
    type: "circle",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "TRANSIT"],
    paint: {
      "circle-radius": ["case", [">", ["get", "stack_count"], 1], 13, 8],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#6b6b6b",
      "circle-stroke-width": ["case", [">", ["get", "stack_count"], 1], 2, 1.5],
    },
  });

  // measurement waypoint circles
  map.addLayer({
    id: WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
    type: "circle",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "MEASUREMENT"],
    paint: {
      "circle-radius": ["case", [">", ["get", "stack_count"], 1], 13, 10],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["case", [">", ["get", "stack_count"], 1], 2, 1.5],
    },
  });

  // hover waypoints - icon varies by camera action
  map.addLayer({
    id: WAYPOINT_HOVER_LAYER,
    type: "symbol",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "HOVER"],
    layout: {
      "icon-image": [
        "match",
        ["get", "camera_action"],
        "RECORDING_START", "recording-start-icon",
        "RECORDING_STOP", "recording-stop-icon",
        "hover-icon",
      ],
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });

  // takeoff marker
  map.addLayer({
    id: WAYPOINT_TAKEOFF_LAYER,
    type: "symbol",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "TAKEOFF"],
    layout: {
      "icon-image": "takeoff-square",
      "icon-size": 1.5,
      "icon-allow-overlap": true,
    },
  });

  // landing marker
  map.addLayer({
    id: WAYPOINT_LANDING_LAYER,
    type: "symbol",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "LANDING"],
    layout: {
      "icon-image": "landing-square",
      "icon-size": 1.5,
      "icon-allow-overlap": true,
    },
  });

  // inspection number labels - measurement waypoints only
  map.addLayer({
    id: WAYPOINT_LABEL_LAYER,
    type: "symbol",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "waypoint_type"], "MEASUREMENT"],
    layout: {
      "text-field": ["get", "label"],
      "text-size": 10,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  // selected waypoint highlight ring
  map.addLayer({
    id: WAYPOINT_SELECTED_LAYER,
    type: "circle",
    source: WAYPOINT_SOURCE,
    filter: ["==", ["get", "id"], selectedWaypointId ?? ""],
    paint: {
      "circle-radius": 14,
      "circle-color": "transparent",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
      "circle-stroke-opacity": 0.8,
    },
  });
}

/** updates the selected waypoint filter. */
export function updateSelectedFilter(
  map: MaplibreMap,
  selectedWaypointId?: string | null,
): void {
  try {
    if (map.getLayer(WAYPOINT_SELECTED_LAYER)) {
      map.setFilter(WAYPOINT_SELECTED_LAYER, [
        "==",
        ["get", "id"],
        selectedWaypointId ?? "",
      ]);
    }
  } catch {
    // layer may not exist
  }
}

/** removes all waypoint layers and sources. */
export function removeWaypointLayers(map: MaplibreMap): void {
  const layers = [
    WAYPOINT_GHOST_TRANSIT_LAYER,
    WAYPOINT_SELECTED_LAYER,
    WAYPOINT_LABEL_LAYER,
    WAYPOINT_LANDING_LAYER,
    WAYPOINT_TAKEOFF_LAYER,
    WAYPOINT_HOVER_LAYER,
    WAYPOINT_TRANSIT_CIRCLE_LAYER,
    WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
    WAYPOINT_CAMERA_TARGET_LAYER,
    WAYPOINT_CAMERA_LINE_LAYER,
    WAYPOINT_ARROW_LAYER,
    WAYPOINT_TRANSIT_HIT_LAYER,
    WAYPOINT_LINE_LAYER,
  ];
  const sources = [WAYPOINT_GHOST_TRANSIT_SOURCE, WAYPOINT_SOURCE, WAYPOINT_LINE_SOURCE, "waypoints-camera-source", "waypoints-camera-target-source"];

  try {
    for (const id of layers) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of sources) {
      if (map.getSource(id)) map.removeSource(id);
    }
  } catch {
    // layers may not exist
  }
}

/** returns all waypoint layer ids for layer group mapping. */
export function getWaypointLayerIds(): string[] {
  return [
    WAYPOINT_LINE_LAYER,
    WAYPOINT_ARROW_LAYER,
    WAYPOINT_CAMERA_LINE_LAYER,
    WAYPOINT_TRANSIT_CIRCLE_LAYER,
    WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
    WAYPOINT_HOVER_LAYER,
    WAYPOINT_TAKEOFF_LAYER,
    WAYPOINT_LANDING_LAYER,
    WAYPOINT_LABEL_LAYER,
    WAYPOINT_SELECTED_LAYER,
  ];
}

/** returns simplified trajectory layer ids for layer group mapping. */
export function getSimplifiedTrajectoryLayerIds(): string[] {
  return [
    SIMPLIFIED_LINE_LAYER,
    SIMPLIFIED_CORNERS_LAYER,
    SIMPLIFIED_MEASUREMENT_LAYER,
    SIMPLIFIED_TAKEOFF_LAYER,
    SIMPLIFIED_LANDING_LAYER,
  ];
}

/** builds a simplified polyline from waypoints - no dots, just colored path segments. */
export function waypointsToSimplifiedLineGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );
  if (sorted.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  const SIMPLIFIED_TRANSIT_COLOR = TRANSIT_PATH_COLOR;
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const toType = to.waypoint_type;

    const color =
      toType === "TRANSIT" || toType === "TAKEOFF" || toType === "LANDING"
        ? SIMPLIFIED_TRANSIT_COLOR
        : DEFAULT_MEASUREMENT_COLOR;

    features.push({
      type: "Feature",
      properties: { color },
      geometry: {
        type: "LineString",
        coordinates: [from.position.coordinates, to.position.coordinates],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/** builds corner dots for simplified trajectory - points where the path changes direction. */
export function waypointsToSimplifiedCornersGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );
  if (sorted.length < 3) {
    return { type: "FeatureCollection", features: [] };
  }

  const features: GeoJSON.Feature[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1].position.coordinates;
    const curr = sorted[i].position.coordinates;
    const next = sorted[i + 1].position.coordinates;

    // skip takeoff/landing - they have their own markers
    const type = sorted[i].waypoint_type;
    if (type === "TAKEOFF" || type === "LANDING") continue;

    // mark waypoint type transitions (e.g. transit -> measurement entry)
    const prevType = sorted[i - 1].waypoint_type;
    if (prevType !== type && type !== "TRANSIT") {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: curr },
      });
      continue;
    }

    // check if direction changes (compare heading before and after)
    const dxA = curr[0] - prev[0];
    const dyA = curr[1] - prev[1];
    const dxB = next[0] - curr[0];
    const dyB = next[1] - curr[1];
    const dot = dxA * dxB + dyA * dyB;
    const magA = Math.sqrt(dxA * dxA + dyA * dyA);
    const magB = Math.sqrt(dxB * dxB + dyB * dyB);
    if (magA === 0 || magB === 0) continue;
    const cos = dot / (magA * magB);

    // if angle > ~10 degrees, it's a corner
    if (cos < 0.985) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: curr },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/** builds measurement position dots for simplified trajectory - only vertical stacks. */
export function waypointsToSimplifiedMeasurementGeoJSON(
  waypoints: WaypointResponse[],
): GeoJSON.FeatureCollection {
  // count measurement/hover waypoints per ground position
  const counts = new Map<string, { coords: number[]; count: number }>();

  for (const wp of waypoints) {
    if (wp.waypoint_type !== "MEASUREMENT" && wp.waypoint_type !== "HOVER") continue;
    const key = coordKey(wp.position.coordinates[0], wp.position.coordinates[1]);
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { coords: wp.position.coordinates, count: 1 });
    }
  }

  // only show dots for stacked positions (vertical profiles, count > 1)
  const features: GeoJSON.Feature[] = [];
  for (const { coords, count } of counts.values()) {
    if (count > 1) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: coords },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/** adds simplified trajectory layers - polyline only with takeoff/landing markers. */
export function addSimplifiedTrajectoryLayers(
  map: MaplibreMap,
  waypoints: WaypointResponse[],
  takeoff?: PointZ | null,
  landing?: PointZ | null,
): void {
  if (waypoints.length === 0 && !takeoff && !landing) {
    removeSimplifiedTrajectoryLayers(map);
    return;
  }

  const lineData = waypointsToSimplifiedLineGeoJSON(waypoints);
  const cornersData = waypointsToSimplifiedCornersGeoJSON(waypoints);
  const measurementData = waypointsToSimplifiedMeasurementGeoJSON(waypoints);

  // find takeoff/landing from waypoints if not provided
  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );
  const takeoffWp = sorted.find((w) => w.waypoint_type === "TAKEOFF");
  const landingWp = [...sorted].reverse().find((w: WaypointResponse) => w.waypoint_type === "LANDING");

  const takeoffCoords = takeoff?.coordinates ?? takeoffWp?.position.coordinates;
  const landingCoords = landing?.coordinates ?? landingWp?.position.coordinates;

  const takeoffData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: takeoffCoords
      ? [
          {
            type: "Feature",
            properties: { waypoint_type: "TAKEOFF" },
            geometry: { type: "Point", coordinates: takeoffCoords },
          },
        ]
      : [],
  };

  const landingData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: landingCoords
      ? [
          {
            type: "Feature",
            properties: { waypoint_type: "LANDING" },
            geometry: { type: "Point", coordinates: landingCoords },
          },
        ]
      : [],
  };

  // update existing sources if present
  const existingLineSrc = map.getSource(SIMPLIFIED_LINE_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (existingLineSrc) {
    existingLineSrc.setData(lineData);
    const tkSrc = map.getSource(SIMPLIFIED_TAKEOFF_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (tkSrc) tkSrc.setData(takeoffData);
    const ldSrc = map.getSource(SIMPLIFIED_LANDING_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (ldSrc) ldSrc.setData(landingData);
    const cornerSrc = map.getSource(SIMPLIFIED_CORNERS_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (cornerSrc) cornerSrc.setData(cornersData);
    const measSrc = map.getSource(SIMPLIFIED_MEASUREMENT_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (measSrc) measSrc.setData(measurementData);
    return;
  }

  // add sources
  map.addSource(SIMPLIFIED_LINE_SOURCE, { type: "geojson", data: lineData });
  map.addSource(SIMPLIFIED_CORNERS_SOURCE, { type: "geojson", data: cornersData });
  map.addSource(SIMPLIFIED_MEASUREMENT_SOURCE, { type: "geojson", data: measurementData });
  map.addSource(SIMPLIFIED_TAKEOFF_SOURCE, { type: "geojson", data: takeoffData });
  map.addSource(SIMPLIFIED_LANDING_SOURCE, { type: "geojson", data: landingData });

  // polyline path
  map.addLayer({
    id: SIMPLIFIED_LINE_LAYER,
    type: "line",
    source: SIMPLIFIED_LINE_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 5,
      "line-opacity": 0.9,
    },
  });

  // corner dots where path changes direction
  map.addLayer({
    id: SIMPLIFIED_CORNERS_LAYER,
    type: "circle",
    source: SIMPLIFIED_CORNERS_SOURCE,
    paint: {
      "circle-radius": 4,
      "circle-color": "#000000",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
      "circle-opacity": 0.8,
    },
  });

  // measurement position dots
  map.addLayer({
    id: SIMPLIFIED_MEASUREMENT_LAYER,
    type: "circle",
    source: SIMPLIFIED_MEASUREMENT_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": DEFAULT_MEASUREMENT_COLOR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.9,
    },
  });

  // takeoff marker
  map.addLayer({
    id: SIMPLIFIED_TAKEOFF_LAYER,
    type: "symbol",
    source: SIMPLIFIED_TAKEOFF_SOURCE,
    layout: {
      "icon-image": "takeoff-square",
      "icon-size": 1.5,
      "icon-allow-overlap": true,
    },
  });

  // landing marker
  map.addLayer({
    id: SIMPLIFIED_LANDING_LAYER,
    type: "symbol",
    source: SIMPLIFIED_LANDING_SOURCE,
    layout: {
      "icon-image": "landing-square",
      "icon-size": 1.5,
      "icon-allow-overlap": true,
    },
  });
}

/** removes simplified trajectory layers and sources. */
export function removeSimplifiedTrajectoryLayers(map: MaplibreMap): void {
  const layers = [
    SIMPLIFIED_LANDING_LAYER,
    SIMPLIFIED_TAKEOFF_LAYER,
    SIMPLIFIED_MEASUREMENT_LAYER,
    SIMPLIFIED_CORNERS_LAYER,
    SIMPLIFIED_LINE_LAYER,
  ];
  const sources = [
    SIMPLIFIED_LANDING_SOURCE,
    SIMPLIFIED_TAKEOFF_SOURCE,
    SIMPLIFIED_MEASUREMENT_SOURCE,
    SIMPLIFIED_CORNERS_SOURCE,
    SIMPLIFIED_LINE_SOURCE,
  ];

  try {
    for (const id of layers) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of sources) {
      if (map.getSource(id)) map.removeSource(id);
    }
  } catch {
    // layers may not exist
  }
}
