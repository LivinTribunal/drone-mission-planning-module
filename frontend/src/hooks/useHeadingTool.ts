import { useState, useCallback, useMemo } from "react";
import { computeBearing } from "@/utils/geo";

interface HeadingReturn {
  origin: [number, number] | null;
  endpoint: [number, number] | null;
  cursorPoint: [number, number] | null;
  isDrawing: boolean;
  isLocked: boolean;
  isComplete: boolean;
  bearing: number | null;
  pointGeoJSON: GeoJSON.FeatureCollection;
  lineGeoJSON: GeoJSON.FeatureCollection;
  labelGeoJSON: GeoJSON.FeatureCollection;
  addPoint: (lng: number, lat: number) => void;
  setCursor: (lng: number, lat: number) => void;
  clear: () => void;
  dismiss: () => void;
  hasPoints: boolean;
}

interface HeadingState {
  origin: [number, number] | null;
  endpoint: [number, number] | null;
  cursorPoint: [number, number] | null;
  isDrawing: boolean;
  isLocked: boolean;
}

const INITIAL_STATE: HeadingState = {
  origin: null,
  endpoint: null,
  cursorPoint: null,
  isDrawing: false,
  isLocked: false,
};

export default function useHeadingTool(): HeadingReturn {
  /** heading tool state - single arrow line showing geographic bearing. */
  const [state, setState] = useState<HeadingState>(INITIAL_STATE);

  const addPoint = useCallback((lng: number, lat: number) => {
    /** add origin or endpoint. */
    setState((prev) => {
      if (!prev.origin || prev.isLocked) {
        return {
          origin: [lng, lat],
          endpoint: null,
          cursorPoint: null,
          isDrawing: true,
          isLocked: false,
        };
      }
      return {
        ...prev,
        endpoint: [lng, lat],
        cursorPoint: null,
        isDrawing: false,
        isLocked: true,
      };
    });
  }, []);

  const setCursor = useCallback((lng: number, lat: number) => {
    /** update cursor position. */
    setState((prev) => {
      if (!prev.isDrawing) return prev;
      return { ...prev, cursorPoint: [lng, lat] };
    });
  }, []);

  const clear = useCallback(() => {
    /** clear all heading state. */
    setState(INITIAL_STATE);
  }, []);

  const dismiss = useCallback(() => {
    /** dismiss the completed heading info card and clear data. */
    clear();
  }, [clear]);

  const { origin, endpoint, cursorPoint, isDrawing, isLocked } = state;
  const target = endpoint ?? cursorPoint;

  const bearing = useMemo(() => {
    if (!origin || !target) return null;
    return Math.round(computeBearing(origin[0], origin[1], target[0], target[1]) * 100) / 100;
  }, [origin, target]);

  const pointGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    if (origin) {
      features.push({
        type: "Feature",
        properties: { kind: "origin" },
        geometry: { type: "Point", coordinates: origin },
      });
    }
    if (target && bearing !== null) {
      features.push({
        type: "Feature",
        properties: { kind: "endpoint", bearing: bearing - 90 },
        geometry: { type: "Point", coordinates: target },
      });
    }
    return { type: "FeatureCollection", features };
  }, [origin, target, bearing]);

  const lineGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    if (origin && target) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [origin, target] },
      });
    }
    return { type: "FeatureCollection", features };
  }, [origin, target]);

  const labelGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    if (origin && target && bearing !== null) {
      const midLng = (origin[0] + target[0]) / 2;
      const midLat = (origin[1] + target[1]) / 2;
      features.push({
        type: "Feature",
        properties: { label: `${bearing.toFixed(2)}°` },
        geometry: { type: "Point", coordinates: [midLng, midLat] },
      });
    }
    return { type: "FeatureCollection", features };
  }, [origin, target, bearing]);

  return {
    origin,
    endpoint,
    cursorPoint,
    isDrawing,
    isLocked,
    isComplete: isLocked,
    bearing,
    pointGeoJSON,
    lineGeoJSON,
    labelGeoJSON,
    addPoint,
    setCursor,
    clear,
    dismiss,
    hasPoints: origin !== null,
  };
}
