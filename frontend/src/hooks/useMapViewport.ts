import { useCallback, useRef } from "react";
import type { MapLayerConfig } from "@/types/map";

const VIEWPORT_PREFIX = "tarmacview_mapViewport_";
const LAYERS_PREFIX = "tarmacview_mapLayers_";

export interface MapViewportState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

function storageKey(prefix: string, airportId: string): string {
  return `${prefix}${airportId}`;
}

export function getSavedViewport(
  airportId: string,
): MapViewportState | null {
  try {
    const raw = localStorage.getItem(storageKey(VIEWPORT_PREFIX, airportId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed.center) &&
      parsed.center.length === 2 &&
      typeof parsed.zoom === "number"
    ) {
      return parsed as MapViewportState;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveViewport(
  airportId: string,
  state: MapViewportState,
): void {
  try {
    localStorage.setItem(
      storageKey(VIEWPORT_PREFIX, airportId),
      JSON.stringify(state),
    );
  } catch {
    // storage full or unavailable
  }
}

export function getSavedLayers(
  airportId: string,
): Partial<MapLayerConfig> | null {
  try {
    const raw = localStorage.getItem(storageKey(LAYERS_PREFIX, airportId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<MapLayerConfig>;
  } catch {
    return null;
  }
}

export function saveLayers(
  airportId: string,
  layers: MapLayerConfig,
): void {
  try {
    localStorage.setItem(
      storageKey(LAYERS_PREFIX, airportId),
      JSON.stringify(layers),
    );
  } catch {
    // storage full or unavailable
  }
}

export function useMapViewportPersistence(airportId: string | undefined) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSaveViewport = useCallback(
    (state: MapViewportState) => {
      if (!airportId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveViewport(airportId, state);
      }, 300);
    },
    [airportId],
  );

  const persistLayers = useCallback(
    (layers: MapLayerConfig) => {
      if (!airportId) return;
      saveLayers(airportId, layers);
    },
    [airportId],
  );

  return { debouncedSaveViewport, persistLayers };
}
