import { useState, useCallback, useMemo } from "react";

interface MeasureState {
  firstPoint: [number, number] | null;
  secondPoint: [number, number] | null;
}

interface MeasureReturn {
  firstPoint: [number, number] | null;
  secondPoint: [number, number] | null;
  distance: number | null;
  labelText: string;
  lineGeoJSON: GeoJSON.Feature | null;
  addPoint: (lng: number, lat: number) => void;
  clear: () => void;
}

function haversineDistance(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function useMeasureDistance(): MeasureReturn {
  const [state, setState] = useState<MeasureState>({
    firstPoint: null,
    secondPoint: null,
  });

  const addPoint = useCallback((lng: number, lat: number) => {
    setState((prev) => {
      if (prev.firstPoint === null) {
        return { firstPoint: [lng, lat], secondPoint: null };
      }
      if (prev.secondPoint === null) {
        return { ...prev, secondPoint: [lng, lat] };
      }
      // both set - start new measurement
      return { firstPoint: [lng, lat], secondPoint: null };
    });
  }, []);

  const clear = useCallback(() => {
    setState({ firstPoint: null, secondPoint: null });
  }, []);

  const distance = useMemo(() => {
    if (!state.firstPoint || !state.secondPoint) return null;
    return haversineDistance(
      state.firstPoint[0],
      state.firstPoint[1],
      state.secondPoint[0],
      state.secondPoint[1],
    );
  }, [state.firstPoint, state.secondPoint]);

  const labelText = useMemo(() => {
    if (distance === null) return "";
    if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`;
    return `${Math.round(distance)} m`;
  }, [distance]);

  const lineGeoJSON = useMemo((): GeoJSON.Feature | null => {
    if (!state.firstPoint || !state.secondPoint) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [state.firstPoint, state.secondPoint],
      },
    };
  }, [state.firstPoint, state.secondPoint]);

  return {
    firstPoint: state.firstPoint,
    secondPoint: state.secondPoint,
    distance,
    labelText,
    lineGeoJSON,
    addPoint,
    clear,
  };
}
