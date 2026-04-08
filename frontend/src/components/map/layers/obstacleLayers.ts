import type { Map as MaplibreMap } from "maplibre-gl";
import type { ObstacleResponse, SurfaceResponse } from "@/types/airport";
import type { ObstacleType } from "@/types/enums";

export const OBSTACLE_SOURCE = "obstacles";
export const OBSTACLE_BOUNDARY_SOURCE = "obstacles-boundary";
export const OBSTACLE_BUFFER_SOURCE = "obstacles-buffer";
export const OBSTACLE_ICON_LAYER = "obstacles-icon";
export const OBSTACLE_BOUNDARY_LAYER = "obstacles-boundary";
export const OBSTACLE_BOUNDARY_OUTLINE_LAYER = "obstacles-boundary-outline";
export const OBSTACLE_LABEL_LAYER = "obstacles-label";
export const OBSTACLE_BUFFER_FILL_LAYER = "obstacles-buffer-fill";
export const OBSTACLE_BUFFER_OUTLINE_LAYER = "obstacles-buffer-outline";
export const SURFACE_BUFFER_SOURCE = "surfaces-buffer";
export const SURFACE_BUFFER_FILL_LAYER = "surfaces-buffer-fill";
export const SURFACE_BUFFER_OUTLINE_LAYER = "surfaces-buffer-outline";

// backwards compat aliases
export const OBSTACLE_RADIUS_SOURCE = OBSTACLE_BOUNDARY_SOURCE;
export const OBSTACLE_RADIUS_LAYER = OBSTACLE_BOUNDARY_LAYER;
export const OBSTACLE_POINT_LAYER = OBSTACLE_ICON_LAYER;

const obstacleColors: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

export { obstacleColors as OBSTACLE_COLORS };

/** generates a buffered polygon by expanding each vertex outward from centroid. */
function bufferPolygon(
  coords: number[][],
  bufferMeters: number,
): number[][] {
  if (coords.length < 3 || bufferMeters <= 0) return coords;

  const earthRadius = 6371000;
  const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;

  return coords.map((c) => {
    const dx = c[0] - cx;
    const dy = c[1] - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return c;

    const latRad = (cy * Math.PI) / 180;
    const meterPerDegLat = earthRadius * (Math.PI / 180);
    const meterPerDegLon = meterPerDegLat * Math.cos(latRad);

    const dxm = dx * meterPerDegLon;
    const dym = dy * meterPerDegLat;
    const distM = Math.sqrt(dxm * dxm + dym * dym);
    if (distM === 0) return c;

    const scale = (distM + bufferMeters) / distM;
    return [cx + dx * scale, cy + dy * scale];
  });
}

/** adds obstacle layers with per-type colored triangle icons and boundary polygons. */
export function addObstacleLayers(
  map: MaplibreMap,
  obstacles: ObstacleResponse[],
): string[] {
  // point source for icons and labels - use boundary centroid
  map.addSource(OBSTACLE_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: obstacles.map((o) => {
        const ring = o.boundary.coordinates[0];
        const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
        return {
          type: "Feature" as const,
          properties: {
            id: o.id,
            name: o.name,
            obstacleType: o.type,
            height: o.height,
            buffer_distance: o.buffer_distance,
            color: obstacleColors[o.type] ?? "#6b6b6b",
            iconImage: `obstacle-${o.type.toLowerCase()}`,
            entityType: "obstacle",
          },
          geometry: { type: "Point" as const, coordinates: [cx, cy] },
        };
      }),
    },
  });

  // polygon source for obstacle boundaries
  map.addSource(OBSTACLE_BOUNDARY_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: obstacles.map((o) => ({
        type: "Feature" as const,
        properties: {
          id: o.id,
          color: obstacleColors[o.type] ?? "#6b6b6b",
        },
        geometry: o.boundary,
      })),
    },
  });

  // obstacle boundary fill
  map.addLayer({
    id: OBSTACLE_BOUNDARY_LAYER,
    type: "fill",
    source: OBSTACLE_BOUNDARY_SOURCE,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.1,
    },
  });

  // obstacle boundary outline
  map.addLayer({
    id: OBSTACLE_BOUNDARY_OUTLINE_LAYER,
    type: "line",
    source: OBSTACLE_BOUNDARY_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1,
    },
  });

  // per-type colored triangle icon
  map.addLayer({
    id: OBSTACLE_ICON_LAYER,
    type: "symbol",
    source: OBSTACLE_SOURCE,
    layout: {
      "icon-image": ["get", "iconImage"],
      "icon-size": 1.2,
      "icon-allow-overlap": true,
    },
  });

  // labels
  map.addLayer({
    id: OBSTACLE_LABEL_LAYER,
    type: "symbol",
    source: OBSTACLE_SOURCE,
    layout: {
      "text-field": [
        "concat",
        ["get", "name"],
        "  ",
        ["to-string", ["get", "height"]],
        "m",
      ],
      "text-size": 11,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-offset": [0, 1.8],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  return [
    OBSTACLE_BOUNDARY_LAYER,
    OBSTACLE_BOUNDARY_OUTLINE_LAYER,
    OBSTACLE_ICON_LAYER,
    OBSTACLE_LABEL_LAYER,
  ];
}

/** adds buffer zone visualization layers for obstacles and surfaces. */
export function addBufferZoneLayers(
  map: MaplibreMap,
  obstacles: ObstacleResponse[],
  surfaces: SurfaceResponse[],
): string[] {
  // obstacle buffer zones - expanded polygon
  map.addSource(OBSTACLE_BUFFER_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: obstacles
        .filter((o) => o.buffer_distance > 0)
        .map((o) => {
          const ring = o.boundary.coordinates[0];
          const buffered = bufferPolygon(ring, o.buffer_distance);
          // close the ring
          if (buffered.length > 0 && (buffered[0][0] !== buffered[buffered.length - 1][0] || buffered[0][1] !== buffered[buffered.length - 1][1])) {
            buffered.push([...buffered[0]]);
          }
          return {
            type: "Feature" as const,
            properties: {
              id: o.id,
              color: obstacleColors[o.type] ?? "#6b6b6b",
            },
            geometry: {
              type: "Polygon" as const,
              coordinates: [buffered],
            },
          };
        }),
    },
  });

  map.addLayer({
    id: OBSTACLE_BUFFER_FILL_LAYER,
    type: "fill",
    source: OBSTACLE_BUFFER_SOURCE,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.06,
    },
  });

  map.addLayer({
    id: OBSTACLE_BUFFER_OUTLINE_LAYER,
    type: "line",
    source: OBSTACLE_BUFFER_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1,
      "line-dasharray": [4, 2],
    },
  });

  // surface buffer zones
  const surfaceFeatures = surfaces
    .filter((s) => s.boundary && s.buffer_distance > 0)
    .map((s) => {
      const ring = s.boundary!.coordinates[0];
      const buffered = bufferPolygon(ring, s.buffer_distance);
      if (buffered.length > 0 && (buffered[0][0] !== buffered[buffered.length - 1][0] || buffered[0][1] !== buffered[buffered.length - 1][1])) {
        buffered.push([...buffered[0]]);
      }
      return {
        type: "Feature" as const,
        properties: {
          id: s.id,
          color: s.surface_type === "RUNWAY" ? "#3b82f6" : "#8b5cf6",
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [buffered],
        },
      };
    });

  map.addSource(SURFACE_BUFFER_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: surfaceFeatures,
    },
  });

  map.addLayer({
    id: SURFACE_BUFFER_FILL_LAYER,
    type: "fill",
    source: SURFACE_BUFFER_SOURCE,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.06,
    },
  });

  map.addLayer({
    id: SURFACE_BUFFER_OUTLINE_LAYER,
    type: "line",
    source: SURFACE_BUFFER_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1,
      "line-dasharray": [4, 2],
    },
  });

  return [
    OBSTACLE_BUFFER_FILL_LAYER,
    OBSTACLE_BUFFER_OUTLINE_LAYER,
    SURFACE_BUFFER_FILL_LAYER,
    SURFACE_BUFFER_OUTLINE_LAYER,
  ];
}
