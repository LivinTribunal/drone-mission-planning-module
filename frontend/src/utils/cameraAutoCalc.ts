import { OPTICAL_ZOOM_MAX, OPTICAL_ZOOM_MIN } from "@/constants/camera";

/** slant distance between two orthogonal legs. */
export function slantDistanceM(
  horizontalM: number | null | undefined,
  verticalM: number | null | undefined,
): number | null {
  if (typeof horizontalM !== "number" || typeof verticalM !== "number") return null;
  return Math.round(Math.sqrt(horizontalM * horizontalM + verticalM * verticalM) * 10) / 10;
}

/** great-circle-ish planar distance in meters between two lat/lng/alt points. */
export function distanceBetween(
  a: { lat: number; lng: number; alt?: number | null },
  b: { lat: number; lng: number; alt?: number | null },
): number {
  const R = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = dLng * Math.cos((lat1 + lat2) / 2);
  const y = dLat;
  const horiz = Math.sqrt(x * x + y * y) * R;
  const dAlt = (b.alt ?? 0) - (a.alt ?? 0);
  return Math.sqrt(horiz * horiz + dAlt * dAlt);
}

/** largest pairwise distance between a set of positions, in meters. */
export function maxPairwiseDistanceM(
  positions: Array<{ lat: number; lng: number; alt?: number | null }>,
): number {
  let max = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = distanceBetween(positions[i], positions[j]);
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * maximum optical zoom the drone can apply while still fitting every selected
 * LHA inside the frame. the camera must see the full lha_span at the given
 * distance, so zoom is bounded by sensor_fov / angular_span.
 */
export function computeOpticalZoom(
  distanceToLhaM: number | null | undefined,
  lhaSpanM: number | null | undefined,
  sensorFovDeg: number | null | undefined,
  maxOpticalZoom: number | null | undefined,
): number | null {
  if (
    typeof distanceToLhaM !== "number" ||
    typeof sensorFovDeg !== "number" ||
    distanceToLhaM <= 0 ||
    sensorFovDeg <= 0
  ) {
    return null;
  }
  const upper = typeof maxOpticalZoom === "number" && maxOpticalZoom > 0
    ? maxOpticalZoom
    : OPTICAL_ZOOM_MAX;

  // single light or no span - zoom as tight as optics allow
  const span = typeof lhaSpanM === "number" && lhaSpanM > 0 ? lhaSpanM : 0;
  if (span <= 0.01) return upper;

  // angular span (radians) subtended by the lha set from the drone
  const angularSpanRad = 2 * Math.atan(span / (2 * distanceToLhaM));
  if (angularSpanRad <= 0) return upper;
  const fovRad = (sensorFovDeg * Math.PI) / 180;
  const rawZoom = fovRad / angularSpanRad;
  const clamped = Math.max(OPTICAL_ZOOM_MIN, Math.min(upper, rawZoom));
  return Math.round(clamped * 2) / 2;
}

/** true when the user-chosen zoom exceeds the drone's optical limit. */
export function isZoomOverOptical(
  zoom: number | null | undefined,
  maxOpticalZoom: number | null | undefined,
): boolean {
  if (typeof zoom !== "number" || typeof maxOpticalZoom !== "number") return false;
  return zoom > maxOpticalZoom;
}
