export const EARTH_RADIUS = 6371000;
const R = EARTH_RADIUS;

function toRad(d: number): number {
  /** convert degrees to radians. */
  return (d * Math.PI) / 180;
}

export function computeBearing(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  /** compute geographic bearing from point 1 to point 2 in degrees. */
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function haversineDistance(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  /** compute distance in meters between two lng/lat points. */
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  /** format distance for display labels. */
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function computePolygonArea(coords: [number, number][]): number {
  /** compute spherical polygon area in m² using the shoelace formula on projected coords. */
  if (coords.length < 3) return 0;
  // use spherical excess formula (simplified for small polygons)
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[j];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((area * R * R) / 2);
}

export function formatArea(sqMeters: number): string {
  /** format area for display labels. */
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(sqMeters)} m²`;
}

export function circleToPolygon(
  center: [number, number],
  radiusMeters: number,
  numPoints = 64,
): [number, number][] {
  /** approximate a circle as a polygon ring. */
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const dLat = (radiusMeters / R) * Math.cos(angle);
    const dLng = (radiusMeters / (R * Math.cos(toRad(lat)))) * Math.sin(angle);
    coords.push([lng + dLng * (180 / Math.PI), lat + dLat * (180 / Math.PI)]);
  }
  // close the ring
  coords.push(coords[0]);
  return coords;
}

export function pixelDistance(
  map: { project: (lngLat: [number, number]) => { x: number; y: number } },
  a: [number, number],
  b: [number, number],
): number {
  /** compute screen pixel distance between two lnglat points on a map. */
  const pa = map.project(a);
  const pb = map.project(b);
  return Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
}

export function midpoint(a: [number, number], b: [number, number]): [number, number] {
  /** compute geographic midpoint. */
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function rectangleDimensions(
  corner1: [number, number],
  corner2: [number, number],
): { width: number; height: number } {
  /** compute width and height in meters of an axis-aligned rectangle. */
  const width = haversineDistance(corner1[0], corner1[1], corner2[0], corner1[1]);
  const height = haversineDistance(corner1[0], corner1[1], corner1[0], corner2[1]);
  return { width, height };
}

export function polygonCentroid(coords: [number, number][]): [number, number] {
  /** compute vertex-mean approximation of a polygon ring centroid - may fall outside non-convex shapes. */
  if (coords.length === 0) return [0, 0];
  const n = coords[coords.length - 1][0] === coords[0][0] && coords[coords.length - 1][1] === coords[0][1]
    ? coords.length - 1
    : coords.length;
  let sumLng = 0;
  let sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLng / n, sumLat / n];
}

export function extractCenterline(
  ring: [number, number][],
): [number, number][] {
  /** extract a centerline from a polygon ring for surface geometry. returns a 2-point linestring. */
  // find the longest edge pair to determine the main axis
  const pts = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
    ? ring.slice(0, -1)
    : ring;

  if (pts.length < 3) return pts.length >= 2 ? [pts[0], pts[1]] : [[0, 0], [0, 0]];

  // for a rectangle-like polygon, pair opposite edges and return their midpoints
  if (pts.length === 4) {
    const d01 = haversineDistance(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
    const d12 = haversineDistance(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    if (d01 >= d12) {
      // edges 0-1 and 2-3 are the long edges
      return [midpoint(pts[0], pts[3]), midpoint(pts[1], pts[2])];
    } else {
      // edges 1-2 and 3-0 are the long edges
      return [midpoint(pts[0], pts[1]), midpoint(pts[2], pts[3])];
    }
  }

  // general case: use first and farthest point
  let maxDist = 0;
  let farthestIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversineDistance(pts[0][0], pts[0][1], pts[i][0], pts[i][1]);
    if (d > maxDist) {
      maxDist = d;
      farthestIdx = i;
    }
  }
  return [pts[0], pts[farthestIdx]];
}

function interpolatePoint(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  /** linearly interpolate between two lng/lat points. */
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function segmentIntersection(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): [number, number] | null {
  /** find intersection point of two line segments, or null if they don't intersect. */
  const dx1 = p2[0] - p1[0];
  const dy1 = p2[1] - p1[1];
  const dx2 = p4[0] - p3[0];
  const dy2 = p4[1] - p3[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-14) return null;

  const t = ((p3[0] - p1[0]) * dy2 - (p3[1] - p1[1]) * dx2) / denom;
  const u = ((p3[0] - p1[0]) * dy1 - (p3[1] - p1[1]) * dx1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return [p1[0] + t * dx1, p1[1] + t * dy1];
}

export function computePolygonMedianWidth(
  ring: [number, number][],
  centerline: [number, number][],
): number | undefined {
  /** compute median width of a polygon by sampling perpendicular cross-sections along the centerline. */
  if (centerline.length < 2) return undefined;

  const pts = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
    ? ring.slice(0, -1)
    : ring;
  if (pts.length < 3) return undefined;

  // close the ring for edge iteration
  const closed = [...pts, pts[0]];

  const [clA, clB] = centerline;
  const dLng = clB[0] - clA[0];
  const dLat = clB[1] - clA[1];

  // perpendicular direction in coordinate space (scaled for geographic distortion)
  const cosLat = Math.cos(toRad((clA[1] + clB[1]) / 2));
  const perpLng = -dLat / cosLat;
  const perpLat = dLng * cosLat;
  const perpLen = Math.sqrt(perpLng * perpLng + perpLat * perpLat);
  if (perpLen < 1e-14) return undefined;

  // normalize and scale to a generous search distance (~5km in degrees)
  const scale = 0.05 / perpLen;
  const offLng = perpLng * scale;
  const offLat = perpLat * scale;

  // sample 10 cross-sections along the centerline
  const samples = 10;
  const widths: number[] = [];

  for (let s = 1; s <= samples; s++) {
    const t = s / (samples + 1);
    const pt = interpolatePoint(clA, clB, t);

    // ray endpoints far enough to cross the polygon
    const rayA: [number, number] = [pt[0] - offLng, pt[1] - offLat];
    const rayB: [number, number] = [pt[0] + offLng, pt[1] + offLat];

    // find all intersections with polygon edges
    const hits: [number, number][] = [];
    for (let i = 0; i < closed.length - 1; i++) {
      const hit = segmentIntersection(rayA, rayB, closed[i], closed[i + 1]);
      if (hit) hits.push(hit);
    }

    if (hits.length >= 2) {
      // find the pair of hits that straddle the center point - closest on each side
      let minLeft = Infinity;
      let minRight = Infinity;
      let leftHit: [number, number] | null = null;
      let rightHit: [number, number] | null = null;

      for (const h of hits) {
        const dot = (h[0] - pt[0]) * offLng + (h[1] - pt[1]) * offLat;
        const dist = haversineDistance(pt[0], pt[1], h[0], h[1]);
        if (dot < 0 && dist < minLeft) {
          minLeft = dist;
          leftHit = h;
        } else if (dot >= 0 && dist < minRight) {
          minRight = dist;
          rightHit = h;
        }
      }

      if (leftHit && rightHit) {
        widths.push(haversineDistance(leftHit[0], leftHit[1], rightHit[0], rightHit[1]));
      }
    }
  }

  if (widths.length === 0) return undefined;

  // return median
  widths.sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 0
    ? (widths[mid - 1] + widths[mid]) / 2
    : widths[mid];
}
