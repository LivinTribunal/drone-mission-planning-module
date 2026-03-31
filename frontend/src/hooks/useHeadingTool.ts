import { useState, useCallback, useMemo } from "react";

interface HeadingReturn {
  origin: [number, number] | null;
  endpoint: [number, number] | null;
  cursorPoint: [number, number] | null;
  isDrawing: boolean;
  isLocked: boolean;
  bearing: number | null;
  pointGeoJSON: GeoJSON.FeatureCollection;
  lineGeoJSON: GeoJSON.FeatureCollection;
  labelGeoJSON: GeoJSON.FeatureCollection;
  addPoint: (lng: number, lat: number) => void;
  setCursor: (lng: number, lat: number) => void;
  clear: () => void;
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

function computeBearing(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  /** compute geographic bearing from point 1 to point 2 in degrees. */
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

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

  const { origin, endpoint, cursorPoint, isDrawing, isLocked } = state;
  const target = endpoint ?? cursorPoint;

  const bearing = useMemo(() => {
    if (!origin || !target) return null;
    return Math.round(computeBearing(origin[0], origin[1], target[0], target[1]));
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
        properties: { label: `${bearing}°` },
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
    bearing,
    pointGeoJSON,
    lineGeoJSON,
    labelGeoJSON,
    addPoint,
    setCursor,
    clear,
    hasPoints: origin !== null,
  };
}
