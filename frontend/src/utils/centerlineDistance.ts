const EARTH_RADIUS = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * computes the perpendicular distance in meters from a point to
 * the nearest segment of a linestring centerline.
 */
export function distanceFromCenterline(
  point: [number, number],
  centerline: number[][],
): number {
  if (centerline.length < 2) return Infinity;

  let minDist = Infinity;

  for (let i = 0; i < centerline.length - 1; i++) {
    const a = centerline[i];
    const b = centerline[i + 1];
    const d = pointToSegmentDistance(point, [a[0], a[1]], [b[0], b[1]]);
    if (d < minDist) minDist = d;
  }

  return minDist;
}

function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const latRef = toRad((a[1] + b[1]) / 2);
  const mPerDegLon = (Math.PI / 180) * EARTH_RADIUS * Math.cos(latRef);
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS;

  // project everything to local meters
  const ax = a[0] * mPerDegLon;
  const ay = a[1] * mPerDegLat;
  const bx = b[0] * mPerDegLon;
  const by = b[1] * mPerDegLat;
  const px = p[0] * mPerDegLon;
  const py = p[1] * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // clamp parameter to [0, 1] so the nearest point stays on the segment
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  const ex = px - nx;
  const ey = py - ny;
  return Math.sqrt(ex * ex + ey * ey);
}
