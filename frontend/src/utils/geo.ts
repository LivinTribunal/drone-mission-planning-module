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
