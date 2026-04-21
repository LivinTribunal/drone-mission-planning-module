import { OPTICAL_ZOOM_MAX, OPTICAL_ZOOM_MIN } from "@/constants/camera";

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
 * optical zoom needed so the LHA set fits across the frame at the given
 * horizontal distance.
 *
 * geometry:
 *   at 1x zoom the camera sees a frame of width  W = 2 * D * tan(FOV/2)
 *   to make an object of size S fill that frame: zoom = W / S
 *
 *   => zoom = (2 * D * tan(FOV/2)) / S
 *
 * where D is the horizontal distance from the drone to the LHA set, FOV is
 * the sensor horizontal FOV, and S is the LHA span (0 or 1 LHA => clamp to
 * the drone's max optical zoom).
 */
export function computeOpticalZoom(
  horizontalDistanceM: number | null | undefined,
  lhaSpanM: number | null | undefined,
  sensorFovDeg: number | null | undefined,
  maxOpticalZoom: number | null | undefined,
): number | null {
  if (
    typeof horizontalDistanceM !== "number" ||
    typeof sensorFovDeg !== "number" ||
    horizontalDistanceM <= 0 ||
    sensorFovDeg <= 0
  ) {
    return null;
  }
  const upper = typeof maxOpticalZoom === "number" && maxOpticalZoom > 0
    ? maxOpticalZoom
    : OPTICAL_ZOOM_MAX;

  const frameWidthAt1x = 2 * horizontalDistanceM * Math.tan((sensorFovDeg * Math.PI) / 360);
  const span = typeof lhaSpanM === "number" && lhaSpanM > 0 ? lhaSpanM : 0;

  // single light or no span - zoom as tight as optics allow
  if (span <= 0.01) return upper;

  const rawZoom = frameWidthAt1x / span;
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
