import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { MapFeature } from "@/types/map";
import { polygonCentroid, haversineDistance, circleToPolygon, extractCenterline } from "@/utils/geo";
import { bufferLineString } from "@/components/map/layers/surfaceLayers";

const SRC_NODES = "vertex-edit-nodes";
const LYR_CORNERS = "vertex-edit-corners";
const LYR_CENTER = "vertex-edit-center";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type EditMode = "polygon" | "circle";

interface EditState {
  mode: EditMode;
  corners: [number, number][];
  center: [number, number];
  radius: number;
}

// obstacle is a circle if it has radius > 0
function isCircleObstacle(feature: MapFeature): boolean {
  /** check if a feature is a circle obstacle. */
  return feature.type === "obstacle" && (feature.data.radius ?? 0) > 0;
}

function extractEditState(feature: MapFeature): EditState | null {
  /** build edit state from a selected feature. */
  if (feature.type === "safety_zone") {
    const ring = feature.data.geometry.coordinates[0];
    if (!ring || ring.length < 4) return null;
    const corners = ring.slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]);
    return { mode: "polygon", corners, center: polygonCentroid(corners), radius: 0 };
  }

  if (feature.type === "obstacle") {
    const pos = feature.data.position.coordinates;
    const center: [number, number] = [pos[0], pos[1]];
    if (isCircleObstacle(feature)) {
      return { mode: "circle", corners: [], center, radius: feature.data.radius };
    }
    // polygon obstacle
    const ring = feature.data.geometry.coordinates[0];
    if (!ring || ring.length < 4) return null;
    const corners = ring.slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]);
    return { mode: "polygon", corners, center: polygonCentroid(corners), radius: 0 };
  }

  if (feature.type === "surface") {
    // use stored boundary polygon directly when available
    if (feature.data.boundary) {
      const ring = feature.data.boundary.coordinates[0];
      if (!ring || ring.length < 4) return null;
      const corners = ring.slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]);
      return { mode: "polygon", corners, center: polygonCentroid(corners), radius: 0 };
    }
    // fallback: reconstruct from centerline + width (legacy data without boundary)
    const coords = feature.data.geometry.coordinates;
    if (!coords || coords.length < 2) return null;
    const isTaxiway = feature.data.surface_type === "TAXIWAY" || feature.data.surface_type === "APRON";
    const width = isTaxiway ? (feature.data.taxiway_width ?? 20) : (feature.data.width ?? 45);
    const ring2d = bufferLineString(coords, width);
    if (ring2d.length < 4) return null;
    const corners = ring2d.slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]);
    return { mode: "polygon", corners, center: polygonCentroid(corners), radius: 0 };
  }

  return null;
}

function ensureSources(map: maplibregl.Map) {
  /** add vertex editing overlay source and layers. */
  if (map.getSource(SRC_NODES)) return;

  map.addSource(SRC_NODES, { type: "geojson", data: EMPTY_FC });

  // corner vertices - white/green
  map.addLayer({
    id: LYR_CORNERS,
    type: "circle",
    source: SRC_NODES,
    filter: ["in", ["get", "kind"], ["literal", ["corner", "radius"]]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": [
        "case",
        ["==", ["get", "kind"], "radius"], "#4595e5",
        "#3bbb3b",
      ],
      "circle-stroke-width": 2,
    },
  });

  // center mover - blue, larger
  map.addLayer({
    id: LYR_CENTER,
    type: "circle",
    source: SRC_NODES,
    filter: ["==", ["get", "kind"], "center"],
    paint: {
      "circle-radius": 7,
      "circle-color": "#4595e5",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

function clearSources(map: maplibregl.Map) {
  /** clear vertex editing overlay data. */
  const s = map.getSource(SRC_NODES) as maplibregl.GeoJSONSource | undefined;
  if (s) s.setData(EMPTY_FC);
}

function removeSources(map: maplibregl.Map) {
  /** remove vertex editing layers and sources. */
  for (const lyr of [LYR_CENTER, LYR_CORNERS]) {
    try { if (map.getLayer(lyr)) map.removeLayer(lyr); } catch (e) { console.warn("vertex editor: failed to remove layer", lyr, e); }
  }
  try { if (map.getSource(SRC_NODES)) map.removeSource(SRC_NODES); } catch (e) { console.warn("vertex editor: failed to remove source", SRC_NODES, e); }
}

/** poll map.isStyleLoaded() until true, then call callback. returns cancel fn. */
function waitForStyleLoaded(map: maplibregl.Map, callback: () => void): () => void {
  let cancelled = false;
  function check() {
    if (cancelled) return;
    if (map.isStyleLoaded()) callback();
    else requestAnimationFrame(check);
  }
  requestAnimationFrame(check);
  return () => { cancelled = true; };
}

/** compute edge point for circle radius handle (east of center). */
function radiusEdgePoint(center: [number, number], radiusMeters: number): [number, number] {
  const [lng, lat] = center;
  const R = 6371000;
  const dLng = (radiusMeters / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lng + dLng, lat];
}

export interface VertexGeometryUpdate {
  geometry: GeoJSON.Geometry;
  boundary?: GeoJSON.Geometry;
  polygon?: GeoJSON.Geometry;
  position?: { type: "Point"; coordinates: [number, number, number] };
  radius?: number;
  width?: number;
  taxiway_width?: number;
  length?: number;
  heading?: number;
}

interface VertexEditorReturn {
  isEditing: boolean;
}

export default function useVertexEditor(
  map: maplibregl.Map | null,
  feature: MapFeature | null,
  isSelectTool: boolean,
  onGeometryUpdate: (featureType: string, featureId: string, update: VertexGeometryUpdate) => void,
): VertexEditorReturn {
  /** overlay draggable vertex nodes on the selected feature. */
  const stateRef = useRef<EditState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const onUpdateRef = useRef(onGeometryUpdate);
  onUpdateRef.current = onGeometryUpdate;
  const dragRef = useRef<{ kind: "corner" | "center" | "radius"; idx: number } | null>(null);
  const dragStartRef = useRef<[number, number] | null>(null);
  const featureRef = useRef(feature);
  featureRef.current = feature;

  const updateOverlay = useCallback(() => {
    /** sync vertex overlay to map source. */
    if (!map) return;
    if (map.isStyleLoaded()) ensureSources(map);

    const st = stateRef.current;
    if (!st) return;

    const features: GeoJSON.Feature[] = [];

    // corner vertices (polygon mode)
    for (let i = 0; i < st.corners.length; i++) {
      features.push({
        type: "Feature",
        properties: { kind: "corner", idx: i },
        geometry: { type: "Point", coordinates: st.corners[i] },
      });
    }

    // radius edge handle (circle mode)
    if (st.mode === "circle") {
      features.push({
        type: "Feature",
        properties: { kind: "radius", idx: 0 },
        geometry: { type: "Point", coordinates: radiusEdgePoint(st.center, st.radius) },
      });
    }

    // center mover (always)
    features.push({
      type: "Feature",
      properties: { kind: "center", idx: 0 },
      geometry: { type: "Point", coordinates: st.center },
    });

    const src = map.getSource(SRC_NODES) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData({ type: "FeatureCollection", features });
  }, [map]);

  const emitUpdate = useCallback(() => {
    /** emit updated geometry back to parent. */
    const feat = featureRef.current;
    const st = stateRef.current;
    if (!feat || !st) return;

    if (feat.type === "safety_zone") {
      if (st.corners.length < 3) return;
      const elevation = feat.data.geometry.coordinates[0]?.[0]?.[2] ?? 0;
      const ring = [...st.corners.map(([lng, lat]) => [lng, lat, elevation]), [st.corners[0][0], st.corners[0][1], elevation]];
      onUpdateRef.current(feat.type, feat.data.id, {
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    } else if (feat.type === "obstacle") {
      const elevation = feat.data.position.coordinates[2] ?? 0;
      if (st.mode === "circle") {
        const circleRing = circleToPolygon(st.center, Math.max(st.radius, 1));
        const ring3d = circleRing.map(([lng, lat]) => [lng, lat, elevation]);
        onUpdateRef.current(feat.type, feat.data.id, {
          geometry: { type: "Polygon", coordinates: [ring3d] },
          position: { type: "Point", coordinates: [st.center[0], st.center[1], elevation] },
          radius: st.radius,
        });
      } else {
        if (st.corners.length < 3) return;
        const ring = [...st.corners.map(([lng, lat]) => [lng, lat, elevation]), [st.corners[0][0], st.corners[0][1], elevation]];
        onUpdateRef.current(feat.type, feat.data.id, {
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      }
    } else if (feat.type === "surface") {
      if (st.corners.length < 3) return;
      const elevation = feat.data.boundary?.coordinates[0]?.[0]?.[2]
        ?? feat.data.geometry.coordinates[0]?.[2] ?? 0;
      const pts = st.corners;

      // build polygon from current corners - this is the source of truth
      const polyRing = [...pts.map(([lng, lat]) => [lng, lat, elevation]), [pts[0][0], pts[0][1], elevation]];
      const boundaryGeom = { type: "Polygon" as const, coordinates: [polyRing] };

      // derive centerline from polygon corners for labels/dashes
      const centerline = extractCenterline(pts);
      const clCoords = centerline.map(([lng, lat]) => [lng, lat, elevation]);

      // derive width/length/heading for display (only meaningful for 4-corner polygons)
      let width: number | undefined;
      let length: number | undefined;
      if (pts.length === 4) {
        const d01 = haversineDistance(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        const d12 = haversineDistance(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
        if (d01 >= d12) {
          width = (d12 + haversineDistance(pts[3][0], pts[3][1], pts[0][0], pts[0][1])) / 2;
          length = d01;
        } else {
          width = (d01 + haversineDistance(pts[2][0], pts[2][1], pts[3][0], pts[3][1])) / 2;
          length = d12;
        }
      }
      const dLng = centerline[1][0] - centerline[0][0];
      const dLat = centerline[1][1] - centerline[0][1];
      const heading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;

      const isTaxiway = feat.data.surface_type === "TAXIWAY" || feat.data.surface_type === "APRON";
      const roundedWidth = width != null ? Math.round(width * 100) / 100 : undefined;
      onUpdateRef.current(feat.type, feat.data.id, {
        geometry: { type: "LineString", coordinates: clCoords },
        boundary: boundaryGeom,
        polygon: boundaryGeom,
        width: isTaxiway ? undefined : roundedWidth,
        taxiway_width: isTaxiway ? roundedWidth : undefined,
        length: length != null ? Math.round(length * 100) / 100 : undefined,
        heading: heading != null ? Math.round(heading * 10) / 10 : undefined,
      });
    }
  }, []);

  useEffect(() => {
    if (!map || !feature || !isSelectTool) {
      if (map) clearSources(map);
      setIsEditing(false);
      stateRef.current = null;
      return;
    }

    const st = extractEditState(feature);
    if (!st) {
      clearSources(map);
      setIsEditing(false);
      stateRef.current = null;
      return;
    }

    // add overlay sources - poll if style not ready yet
    let cancelPoll: (() => void) | null = null;
    if (map.isStyleLoaded()) {
      ensureSources(map);
    } else {
      cancelPoll = waitForStyleLoaded(map, () => { ensureSources(map); updateOverlay(); });
    }

    stateRef.current = st;
    setIsEditing(true);
    updateOverlay();

    function handleMouseDown(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // query all edit nodes
      const hits = map.queryRenderedFeatures(e.point, { layers: [LYR_CORNERS, LYR_CENTER] });
      if (hits.length > 0) {
        const kind = hits[0].properties?.kind as "corner" | "center" | "radius";
        const idx = hits[0].properties?.idx ?? 0;
        dragRef.current = { kind, idx };
        dragStartRef.current = [e.lngLat.lng, e.lngLat.lat];
        map.dragPan.disable();
        map.getCanvas().style.cursor = kind === "center" ? "move" : "grabbing";
        e.preventDefault();
      }
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const drag = dragRef.current;
      const st = stateRef.current;

      if (drag && st) {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        if (drag.kind === "corner") {
          st.corners[drag.idx] = lngLat;
          st.center = polygonCentroid(st.corners);
        } else if (drag.kind === "center") {
          const start = dragStartRef.current!;
          const dLng = lngLat[0] - start[0];
          const dLat = lngLat[1] - start[1];
          st.corners = st.corners.map(([lng, lat]) => [lng + dLng, lat + dLat] as [number, number]);
          st.center = [st.center[0] + dLng, st.center[1] + dLat];
          dragStartRef.current = lngLat;
        } else if (drag.kind === "radius") {
          st.radius = haversineDistance(st.center[0], st.center[1], lngLat[0], lngLat[1]);
        }

        updateOverlay();
        emitUpdate();
        return;
      }

      // hover cursor
      const hits = map.queryRenderedFeatures(e.point, { layers: [LYR_CORNERS, LYR_CENTER] });
      if (hits.length > 0) {
        const kind = hits[0].properties?.kind;
        map.getCanvas().style.cursor = kind === "center" ? "move" : "grab";
      } else {
        map.getCanvas().style.cursor = "";
      }
    }

    function handleMouseUp() {
      if (!map) return;
      if (dragRef.current) {
        dragRef.current = null;
        dragStartRef.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
      }
    }

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      cancelPoll?.();
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      clearSources(map);
      dragRef.current = null;
    };
  }, [map, feature, isSelectTool, updateOverlay, emitUpdate]);

  useEffect(() => {
    return () => { if (map) removeSources(map); };
  }, [map]);

  return { isEditing };
}
