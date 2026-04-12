import { useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import {
  maplibreToCesiumCamera,
  cesiumToMaplibreCamera,
} from "@/components/map/cesium/cesiumUtils";
import type { Viewer as CesiumViewer } from "cesium";

interface UseCesiumSyncReturn {
  /** sync camera from maplibre to cesium when switching to 3d. */
  syncToCesium: (viewer: CesiumViewer) => void;
  /** sync camera from cesium to maplibre when switching to 2d. */
  syncToMaplibre: (viewer: CesiumViewer) => void;
}

/** hook for synchronizing camera state between maplibre and cesium viewers. */
export default function useCesiumSync(
  mapRef: React.RefObject<maplibregl.Map | null>,
): UseCesiumSyncReturn {
  const lastSyncToCesiumRef = useRef<number>(0);
  const lastSyncToMaplibreRef = useRef<number>(0);

  const syncToCesium = useCallback(
    (viewer: CesiumViewer) => {
      const map = mapRef.current;
      if (!map) return;
      const now = Date.now();
      if (now - lastSyncToCesiumRef.current < 100) return;
      lastSyncToCesiumRef.current = now;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      const viewportHeight = map.getContainer().clientHeight || 800;

      const { destination, orientation } = maplibreToCesiumCamera(
        center,
        zoom,
        bearing,
        pitch,
        viewportHeight,
      );

      viewer.camera.setView({ destination, orientation });
    },
    [mapRef],
  );

  const syncToMaplibre = useCallback(
    (viewer: CesiumViewer) => {
      const map = mapRef.current;
      if (!map) return;
      const now = Date.now();
      if (now - lastSyncToMaplibreRef.current < 100) return;
      lastSyncToMaplibreRef.current = now;

      const camera = viewer.camera;
      const viewportHeight = map.getContainer().clientHeight || 800;
      const result = cesiumToMaplibreCamera(
        camera.position,
        camera.heading,
        camera.pitch,
        viewportHeight,
      );

      map.jumpTo({
        center: [result.center.lng, result.center.lat],
        zoom: result.zoom,
        bearing: result.bearing,
        pitch: result.pitch,
      });
    },
    [mapRef],
  );

  return { syncToCesium, syncToMaplibre };
}
