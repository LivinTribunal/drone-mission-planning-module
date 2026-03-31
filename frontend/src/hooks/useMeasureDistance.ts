import { useState, useCallback, useMemo } from "react";
import { haversineDistance, formatDistance } from "../utils/geo";

const MAX_POINTS = 25;

export interface MeasureSegment {
  from: [number, number];
  to: [number, number];
  distance: number;
  cumulative: number;
}

interface MeasureReturn {
  points: [number, number][];
  segments: MeasureSegment[];
  totalDistance: number;
  cursorPoint: [number, number] | null;
  isDrawing: boolean;
  pointsGeoJSON: GeoJSON.FeatureCollection;
  linesGeoJSON: GeoJSON.FeatureCollection;
  labelsGeoJSON: GeoJSON.FeatureCollection;
  addPoint: (lng: number, lat: number) => void;
  setCursor: (lng: number, lat: number) => void;
  clearCursor: () => void;
  clear: () => void;
  finishDrawing: () => void;
  hasPoints: boolean;
}

export default function useMeasureDistance(): MeasureReturn {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [cursorPoint, setCursorPoint] = useState<[number, number] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const addPoint = useCallback((lng: number, lat: number) => {
    setPoints((prev) => {
      if (prev.length >= MAX_POINTS) return prev;
      return [...prev, [lng, lat]];
    });
    setIsDrawing(true);
  }, []);

  const setCursor = useCallback((lng: number, lat: number) => {
    setCursorPoint([lng, lat]);
  }, []);

  const clearCursor = useCallback(() => {
    setCursorPoint(null);
  }, []);

  const finishDrawing = useCallback(() => {
    /** finish drawing - clear if only one point (no visible segment). */
    setPoints((prev) => {
      if (prev.length < 2) {
        setIsDrawing(false);
        setCursorPoint(null);
        return [];
      }
      setIsDrawing(false);
      setCursorPoint(null);
      return prev;
    });
  }, []);

  const clear = useCallback(() => {
    setPoints([]);
    setCursorPoint(null);
    setIsDrawing(false);
  }, []);

  const segments = useMemo((): MeasureSegment[] => {
    const segs: MeasureSegment[] = [];
    let cumulative = 0;
    for (let i = 1; i < points.length; i++) {
      const dist = haversineDistance(
        points[i - 1][0],
        points[i - 1][1],
        points[i][0],
        points[i][1],
      );
      cumulative += dist;
      segs.push({
        from: points[i - 1],
        to: points[i],
        distance: dist,
        cumulative,
      });
    }
    return segs;
  }, [points]);

  const totalDistance = segments.length > 0 ? segments[segments.length - 1].cumulative : 0;

  const pointsGeoJSON = useMemo((): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature" as const,
      properties: { index: i },
      geometry: { type: "Point" as const, coordinates: p },
    })),
  }), [points]);

  const linesGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];

    // locked segments
    for (const seg of segments) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [seg.from, seg.to],
        },
      });
    }

    // live cursor line from last point
    if (points.length > 0 && cursorPoint) {
      features.push({
        type: "Feature",
        properties: { cursor: true },
        geometry: {
          type: "LineString",
          coordinates: [points[points.length - 1], cursorPoint],
        },
      });
    }

    return { type: "FeatureCollection", features };
  }, [segments, points, cursorPoint]);

  const labelsGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];

    for (const seg of segments) {
      const midLng = (seg.from[0] + seg.to[0]) / 2;
      const midLat = (seg.from[1] + seg.to[1]) / 2;
      const label =
        segments.length === 1
          ? formatDistance(seg.distance)
          : `${formatDistance(seg.distance)} (total: ${formatDistance(seg.cumulative)})`;
      features.push({
        type: "Feature",
        properties: { label },
        geometry: { type: "Point", coordinates: [midLng, midLat] },
      });
    }

    // live cursor label
    if (points.length > 0 && cursorPoint) {
      const last = points[points.length - 1];
      const dist = haversineDistance(last[0], last[1], cursorPoint[0], cursorPoint[1]);
      const cumul = totalDistance + dist;
      const midLng = (last[0] + cursorPoint[0]) / 2;
      const midLat = (last[1] + cursorPoint[1]) / 2;
      const label =
        points.length === 1
          ? formatDistance(dist)
          : `${formatDistance(dist)} (total: ${formatDistance(cumul)})`;
      features.push({
        type: "Feature",
        properties: { label, cursor: true },
        geometry: { type: "Point", coordinates: [midLng, midLat] },
      });
    }

    return { type: "FeatureCollection", features };
  }, [segments, points, cursorPoint, totalDistance]);

  return {
    points,
    segments,
    totalDistance,
    cursorPoint,
    isDrawing,
    pointsGeoJSON,
    linesGeoJSON,
    labelsGeoJSON,
    addPoint,
    setCursor,
    clearCursor,
    clear,
    finishDrawing,
    hasPoints: points.length > 0,
  };
}
