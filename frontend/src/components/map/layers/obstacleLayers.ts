import type { Map as MaplibreMap } from "maplibre-gl";
import type { ObstacleResponse } from "@/types/airport";
import type { ObstacleType } from "@/types/enums";

export const OBSTACLE_SOURCE = "obstacles";
export const OBSTACLE_POINT_LAYER = "obstacles-point";
export const OBSTACLE_RADIUS_LAYER = "obstacles-radius";

const obstacleColors: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

export function addObstacleLayers(
  map: MaplibreMap,
  obstacles: ObstacleResponse[],
): string[] {
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
          entityType: "obstacle",
        },
        geometry: o.position,
      })),
    },
  });

  map.addLayer({
    id: OBSTACLE_POINT_LAYER,
    type: "circle",
    source: OBSTACLE_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  // radius buffer visualization
  map.addLayer(
    {
      id: OBSTACLE_RADIUS_LAYER,
      type: "circle",
      source: OBSTACLE_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          2,
          18,
          ["*", ["get", "radius"], 2],
        ],
        "circle-color": ["get", "color"],
        "circle-opacity": 0.15,
      },
    },
    OBSTACLE_POINT_LAYER,
  );

  return [OBSTACLE_POINT_LAYER, OBSTACLE_RADIUS_LAYER];
}
