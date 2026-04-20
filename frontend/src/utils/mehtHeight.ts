/**
 * Compute MEHT height above threshold from PAPI distance and glide slope angle.
 */
export function computeMehtHeight(
  distanceFromThreshold: number,
  glideSlopeAngle: number,
): number {
  return distanceFromThreshold * Math.tan((glideSlopeAngle * Math.PI) / 180);
}
