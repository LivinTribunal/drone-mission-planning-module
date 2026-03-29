import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { MapFeature } from "@/types/map";
import { midpoint } from "@/utils/geo";

const SRC_VERTICES = "vertex-edit-nodes";
const SRC_MIDPOINTS = "vertex-edit-midpoints";
const LYR_VERTICES = "vertex-edit-nodes-layer";
const LYR_MIDPOINTS = "vertex-edit-midpoints-layer";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function ensureSources(map: maplibregl.Map) {
  /** add vertex editing overlay sources and layers. */
  if (!map.getSource(SRC_VERTICES)) {
    map.addSource(SRC_VERTICES, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: LYR_VERTICES,
      type: "circle",
      source: SRC_VERTICES,
      paint: {
        "circle-radius": [
          "case",
          ["boolean", ["feature-state", "hover"], false], 5,
          4,
        ],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#3bbb3b",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getSource(SRC_MIDPOINTS)) {
    map.addSource(SRC_MIDPOINTS, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: LYR_MIDPOINTS,
      type: "circle",
      source: SRC_MIDPOINTS,
      paint: {
        "circle-radius": 3,
        "circle-color": "rgba(59, 187, 59, 0.5)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
  }
}

function clearSources(map: maplibregl.Map) {
  /** clear vertex editing overlay data. */
  for (const src of [SRC_VERTICES, SRC_MIDPOINTS]) {
    const s = map.getSource(src) as maplibregl.GeoJSONSource | undefined;
    if (s) s.setData(EMPTY_FC);
  }
}

function removeSources(map: maplibregl.Map) {
  /** remove vertex editing layers and sources. */
  for (const lyr of [LYR_MIDPOINTS, LYR_VERTICES]) {
    try { if (map.getLayer(lyr)) map.removeLayer(lyr); } catch { /* noop */ }
  }
  for (const src of [SRC_MIDPOINTS, SRC_VERTICES]) {
    try { if (map.getSource(src)) map.removeSource(src); } catch { /* noop */ }
  }
}

function extractPolygonVertices(feature: MapFeature): [number, number][] | null {
  /** extract editable vertices from a polygon feature (safety zones and obstacles). */
  if (feature.type === "safety_zone" || feature.type === "obstacle") {
    const ring = feature.data.geometry.coordinates[0];
    if (!ring || ring.length < 4) return null;
    // exclude closing vertex
    return ring.slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]);
  }
  return null;
}

function computeMidpoints(verts: [number, number][]): [number, number][] {
  /** compute midpoints between consecutive vertices (wrapping last to first). */
  const mids: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    mids.push(midpoint(verts[i], verts[j]));
  }
  return mids;
}

interface VertexEditorReturn {
  isEditing: boolean;
}

export default function useVertexEditor(
  map: maplibregl.Map | null,
  feature: MapFeature | null,
  isSelectTool: boolean,
  onGeometryUpdate: (featureType: string, featureId: string, geometry: GeoJSON.Geometry) => void,
): VertexEditorReturn {
  /** overlay draggable vertex nodes on the selected polygon feature. */
  const verticesRef = useRef<[number, number][]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const onUpdateRef = useRef(onGeometryUpdate);
  onUpdateRef.current = onGeometryUpdate;
  const dragIdxRef = useRef<number | null>(null);
  const shiftDragRef = useRef(false);
  const shiftDragStartRef = useRef<[number, number] | null>(null);
  const featureRef = useRef(feature);
  featureRef.current = feature;

  const updateOverlay = useCallback(() => {
    /** sync vertex/midpoint overlay to map sources. */
    if (!map) return;
    const verts = verticesRef.current;

    const vertSrc = map.getSource(SRC_VERTICES) as maplibregl.GeoJSONSource | undefined;
    if (vertSrc) {
      vertSrc.setData({
        type: "FeatureCollection",
        features: verts.map((v, i) => ({
          type: "Feature" as const,
          properties: { idx: i },
          geometry: { type: "Point" as const, coordinates: v },
        })),
      });
    }

    const mids = computeMidpoints(verts);
    const midSrc = map.getSource(SRC_MIDPOINTS) as maplibregl.GeoJSONSource | undefined;
    if (midSrc) {
      midSrc.setData({
        type: "FeatureCollection",
        features: mids.map((m, i) => ({
          type: "Feature" as const,
          properties: { idx: i },
          geometry: { type: "Point" as const, coordinates: m },
        })),
      });
    }
  }, [map]);

  const emitUpdate = useCallback(() => {
    /** emit updated geometry back to parent. */
    const feat = featureRef.current;
    if (!feat) return;
    const verts = verticesRef.current;
    if (verts.length < 3) return;

    if (feat.type === "safety_zone" || feat.type === "obstacle") {
      const elevation = feat.data.geometry.coordinates[0]?.[0]?.[2] ?? 0;
      const ring = [...verts.map(([lng, lat]) => [lng, lat, elevation]), [verts[0][0], verts[0][1], elevation]];
      onUpdateRef.current(feat.type, feat.data.id, {
        type: "Polygon",
        coordinates: [ring],
      });
    }
  }, []);

  useEffect(() => {
    if (!map || !feature || !isSelectTool) {
      if (map) clearSources(map);
      setIsEditing(false);
      verticesRef.current = [];
      return;
    }

    const verts = extractPolygonVertices(feature);
    if (!verts) {
      clearSources(map);
      setIsEditing(false);
      verticesRef.current = [];
      return;
    }

    if (map.isStyleLoaded()) {
      ensureSources(map);
    } else {
      map.once("style.load", () => { ensureSources(map); updateOverlay(); });
    }

    verticesRef.current = verts;
    setIsEditing(true);
    updateOverlay();

    // vertex drag handling
    function handleMouseDown(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // check if clicking on a vertex
      const vertFeatures = map.queryRenderedFeatures(e.point, { layers: [LYR_VERTICES] });
      if (vertFeatures.length > 0) {
        const idx = vertFeatures[0].properties?.idx;
        if (idx != null) {
          dragIdxRef.current = idx;
          map.dragPan.disable();
          map.getCanvas().style.cursor = "grabbing";
          e.preventDefault();
          return;
        }
      }

      // check if clicking on a midpoint to insert vertex
      const midFeatures = map.queryRenderedFeatures(e.point, { layers: [LYR_MIDPOINTS] });
      if (midFeatures.length > 0) {
        const idx = midFeatures[0].properties?.idx;
        if (idx != null) {
          const coords = midFeatures[0].geometry;
          if (coords && "coordinates" in coords) {
            const [lng, lat] = (coords as GeoJSON.Point).coordinates;
            // insert vertex after idx
            const v = verticesRef.current;
            verticesRef.current = [...v.slice(0, idx + 1), [lng, lat], ...v.slice(idx + 1)];
            updateOverlay();
            emitUpdate();
          }
          e.preventDefault();
          return;
        }
      }

      // shift+click on polygon fill to move entire polygon
      if (e.originalEvent.shiftKey && (featureRef.current?.type === "safety_zone" || featureRef.current?.type === "obstacle")) {
        shiftDragRef.current = true;
        shiftDragStartRef.current = [e.lngLat.lng, e.lngLat.lat];
        map.dragPan.disable();
        map.getCanvas().style.cursor = "move";
        e.preventDefault();
      }
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // drag vertex
      if (dragIdxRef.current != null) {
        const verts = verticesRef.current;
        const idx = dragIdxRef.current;
        if (idx >= 0 && idx < verts.length) {
          verts[idx] = [e.lngLat.lng, e.lngLat.lat];
          verticesRef.current = [...verts];
          updateOverlay();
        }
        return;
      }

      // shift drag entire polygon
      if (shiftDragRef.current && shiftDragStartRef.current) {
        const start = shiftDragStartRef.current;
        const dLng = e.lngLat.lng - start[0];
        const dLat = e.lngLat.lat - start[1];
        verticesRef.current = verticesRef.current.map(([lng, lat]) => [lng + dLng, lat + dLat] as [number, number]);
        shiftDragStartRef.current = [e.lngLat.lng, e.lngLat.lat];
        updateOverlay();
        return;
      }

      // hover cursor change
      const vertHit = map.queryRenderedFeatures(e.point, { layers: [LYR_VERTICES] });
      if (vertHit.length > 0) {
        map.getCanvas().style.cursor = "grab";
        return;
      }
      const midHit = map.queryRenderedFeatures(e.point, { layers: [LYR_MIDPOINTS] });
      if (midHit.length > 0) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      // default cursor
      map.getCanvas().style.cursor = "";
    }

    function handleMouseUp() {
      if (!map) return;
      if (dragIdxRef.current != null || shiftDragRef.current) {
        dragIdxRef.current = null;
        shiftDragRef.current = false;
        shiftDragStartRef.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
        emitUpdate();
      }
    }

    function handleContextMenu(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      // right-click on a vertex to delete it
      const vertFeatures = map.queryRenderedFeatures(e.point, { layers: [LYR_VERTICES] });
      if (vertFeatures.length > 0) {
        e.preventDefault();
        const idx = vertFeatures[0].properties?.idx;
        if (idx != null && verticesRef.current.length > 3) {
          verticesRef.current = verticesRef.current.filter((_, i) => i !== idx);
          updateOverlay();
          emitUpdate();
        }
      }
    }

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("contextmenu", handleContextMenu);

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("contextmenu", handleContextMenu);
      clearSources(map);
      dragIdxRef.current = null;
      shiftDragRef.current = false;
    };
  }, [map, feature, isSelectTool, updateOverlay, emitUpdate]);

  useEffect(() => {
    return () => { if (map) removeSources(map); };
  }, [map]);

  return { isEditing };
}
