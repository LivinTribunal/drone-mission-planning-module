import type { Map as MaplibreMap } from "maplibre-gl";
import type { ObstacleResponse } from "@/types/airport";
import type { ObstacleType } from "@/types/enums";

export const OBSTACLE_SOURCE = "obstacles";
export const OBSTACLE_RADIUS_SOURCE = "obstacles-radius";
export const OBSTACLE_ICON_LAYER = "obstacles-icon";
export const OBSTACLE_RADIUS_LAYER = "obstacles-radius";
export const OBSTACLE_LABEL_LAYER = "obstacles-label";

// backwards compat alias
export const OBSTACLE_POINT_LAYER = OBSTACLE_ICON_LAYER;

const obstacleColors: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

const CIRCLE_SEGMENTS = 64;

/** generates a polygon circle approximation from a center point and radius in meters. */
function circlePolygon(
  centerLon: number,
  centerLat: number,
  radiusMeters: number,
): number[][] {
  const coords: number[][] = [];
  const earthRadius = 6371000;
  const latRad = (centerLat * Math.PI) / 180;

  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    const dLat = (radiusMeters * Math.cos(angle)) / earthRadius;
    const dLon =
      (radiusMeters * Math.sin(angle)) / (earthRadius * Math.cos(latRad));
    coords.push([
      centerLon + (dLon * 180) / Math.PI,
      centerLat + (dLat * 180) / Math.PI,
    ]);
  }

  return coords;
}

/** adds obstacle layers with per-type colored triangle icons and radius buffers. */
export function addObstacleLayers(
  map: MaplibreMap,
  obstacles: ObstacleResponse[],
): string[] {
  // point source for icons and labels
  map.addSource(OBSTACLE_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: obstacles.map((o) => ({
        type: "Feature" as const,
        properties: {
          id: o.id,
          name: o.name,
          obstacleType: o.type,
          height: o.height,
          radius: o.radius,
          color: obstacleColors[o.type] ?? "#6b6b6b",
          iconImage: `obstacle-${o.type.toLowerCase()}`,
          entityType: "obstacle",
        },
        geometry: o.position,
      })),
    },
  });

  // polygon source for geographic radius circles
  map.addSource(OBSTACLE_RADIUS_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: obstacles
        .filter((o) => o.radius > 0)
        .map((o) => {
          const [lon, lat] = o.position.coordinates;
          return {
            type: "Feature" as const,
            properties: {
              id: o.id,
              color: obstacleColors[o.type] ?? "#6b6b6b",
            },
            geometry: {
              type: "Polygon" as const,
              coordinates: [circlePolygon(lon, lat, o.radius)],
            },
          };
        }),
    },
  });

  // radius buffer - geographic polygon fill
  map.addLayer({
    id: OBSTACLE_RADIUS_LAYER,
    type: "fill",
    source: OBSTACLE_RADIUS_SOURCE,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.1,
    },
  });

  // radius buffer outline
  map.addLayer({
    id: "obstacles-radius-outline",
    type: "line",
    source: OBSTACLE_RADIUS_SOURCE,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1,
    },
  });

  // per-type colored triangle icon - fixed size
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

  return [OBSTACLE_RADIUS_LAYER, "obstacles-radius-outline", OBSTACLE_ICON_LAYER, OBSTACLE_LABEL_LAYER];
}
