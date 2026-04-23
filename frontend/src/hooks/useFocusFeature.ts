import { useCallback } from "react";
import type { RefObject } from "react";
import type maplibregl from "maplibre-gl";
import type { Viewer as CesiumViewerType } from "cesium";
import type { MapFeature } from "@/types/map";

/** compute a lon/lat center and target maplibre zoom for a feature. */
export function computeMapLibreFocus(
  feature: MapFeature,
): { lon: number; lat: number; minZoom: number } | null {
  let lon: number | undefined;
  let lat: number | undefined;
  let minZoom = 16;

  if (feature.type === "waypoint") {
    const coords = feature.data.position?.coordinates;
    if (coords) {
      [lon, lat] = coords;
    }
    minZoom = 17;
  } else if (feature.type === "obstacle") {
    const ring = feature.data.boundary?.coordinates?.[0];
    if (ring && ring.length > 0) {
      lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
    }
  } else if (feature.type === "agl") {
    [lon, lat] = feature.data.position.coordinates;
  } else if (feature.type === "lha") {
    [lon, lat] = feature.data.position.coordinates;
    minZoom = 18;
  } else if (feature.type === "surface") {
    const coords = feature.data.geometry.coordinates;
    if (coords.length > 0) {
      lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
      lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    }
  } else if (feature.type === "safety_zone") {
    const ring = feature.data.geometry?.coordinates?.[0];
    if (ring && ring.length > 0) {
      lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
    }
  }

  if (lon === undefined || lat === undefined) return null;
  return { lon, lat, minZoom };
}

/** fly a maplibre map to the center of a feature. */
export function flyMapLibreToFeature(map: maplibregl.Map, feature: MapFeature): void {
  const focus = computeMapLibreFocus(feature);
  if (!focus) return;
  map.flyTo({
    center: [focus.lon, focus.lat],
    zoom: Math.max(map.getZoom(), focus.minZoom),
    duration: 800,
  });
}

/** cesium camera range (meters) for a feature type. */
export function cesiumRangeForFeature(feature: MapFeature): number {
  if (feature.type === "obstacle") return 150;
  if (feature.type === "agl" || feature.type === "lha") return 100;
  if (feature.type === "surface") return 500;
  return 300;
}

/** fly a cesium viewer to a feature. prefers matching entity, falls back to coords. */
export async function flyCesiumToFeature(
  viewer: CesiumViewerType,
  feature: MapFeature,
): Promise<void> {
  const cesium = await import("cesium");
  const { Cartesian3, HeadingPitchRange, Math: CesiumMath } = cesium;
  if (viewer.isDestroyed()) return;

  const targetType = feature.type;
  const targetId = feature.data.id;
  const match = viewer.entities.values.find((entity) => {
    const props = entity.properties;
    if (!props) return false;
    return (
      props.featureType?.getValue() === targetType &&
      props.featureId?.getValue() === targetId
    );
  });

  const range = cesiumRangeForFeature(feature);

  if (match) {
    viewer.flyTo(match, {
      duration: 1.5,
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(0),
        CesiumMath.toRadians(-45),
        range,
      ),
    });
    return;
  }

  // fallback: fly to feature coordinates
  const data = feature.data as Record<string, unknown>;
  const pos = data.position as { coordinates?: number[] } | undefined;
  if (!pos?.coordinates) return;
  const [lon, lat, alt] = pos.coordinates;
  if (lon == null || lat == null) return;
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, (alt ?? 0) + range),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-45),
      roll: 0,
    },
    duration: 1.5,
  });
}

interface UseFocusFeatureOpts {
  mapRef?: RefObject<maplibregl.Map | null>;
  cesiumViewerRef?: RefObject<CesiumViewerType | null>;
}

/**
 * shared intent router for "locate" (recenter) requests across 2d/3d maps.
 * callers give it refs; it returns a single locateFeature(feature) function
 * that dispatches to whichever map is currently live.
 */
export function useFocusFeature({
  mapRef,
  cesiumViewerRef,
}: UseFocusFeatureOpts) {
  const locateFeature = useCallback(
    (feature: MapFeature | null) => {
      if (!feature) return;
      const viewer = cesiumViewerRef?.current;
      if (viewer && !viewer.isDestroyed()) {
        void flyCesiumToFeature(viewer, feature);
        return;
      }
      const map = mapRef?.current;
      if (map) {
        flyMapLibreToFeature(map, feature);
      }
    },
    [mapRef, cesiumViewerRef],
  );

  return { locateFeature };
}
