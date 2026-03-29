import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

const SRC_PREVIEW = "draw-point-preview";
const LYR_PREVIEW = "draw-point-preview-layer";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function ensureSources(map: maplibregl.Map) {
  /** add point placement preview source and layer. */
  if (!map.getSource(SRC_PREVIEW)) {
    map.addSource(SRC_PREVIEW, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: LYR_PREVIEW,
      type: "circle",
      source: SRC_PREVIEW,
      paint: {
        "circle-radius": 6,
        "circle-color": "#3bbb3b",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.7,
      },
    });
  }
}

function clearSources(map: maplibregl.Map) {
  /** clear point preview source. */
  const s = map.getSource(SRC_PREVIEW) as maplibregl.GeoJSONSource | undefined;
  if (s) s.setData(EMPTY_FC);
}

function removeSources(map: maplibregl.Map) {
  /** remove point preview layer and source. */
  try { if (map.getLayer(LYR_PREVIEW)) map.removeLayer(LYR_PREVIEW); } catch { /* noop */ }
  try { if (map.getSource(SRC_PREVIEW)) map.removeSource(SRC_PREVIEW); } catch { /* noop */ }
}

export default function usePlacePoint(
  map: maplibregl.Map | null,
  active: boolean,
  onComplete: (point: [number, number]) => void,
): void {
  /** point placement tool - single click to place, cursor preview follows mouse. */
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!map || !active) return;

    if (map.isStyleLoaded()) ensureSources(map);

    map.getCanvas().style.cursor = "crosshair";
    map.dragPan.disable();

    function handleClick(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      clearSources(map);
      onCompleteRef.current([e.lngLat.lng, e.lngLat.lat]);
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const s = map.getSource(SRC_PREVIEW) as maplibregl.GeoJSONSource | undefined;
      if (s) {
        s.setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat] },
          }],
        });
      }
    }

    function handleContextMenu(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      // right-click does nothing special for point, just prevents context menu
    }

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("contextmenu", handleContextMenu);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("contextmenu", handleContextMenu);
      map.getCanvas().style.cursor = "";
      map.dragPan.enable();
      clearSources(map);
    };
  }, [map, active]);

  useEffect(() => {
    return () => { if (map) removeSources(map); };
  }, [map]);
}
