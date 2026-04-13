import type { Map as MaplibreMap } from "maplibre-gl";
import type { SafetyZoneResponse } from "@/types/airport";
import type { SafetyZoneType } from "@/types/enums";
import { createHatchPattern } from "./mapImages";

export const SAFETY_ZONE_SOURCE = "safety-zones";
export const SAFETY_ZONE_FILL_LAYER = "safety-zones-fill";
export const SAFETY_ZONE_HATCH_LAYER = "safety-zones-hatch";
export const SAFETY_ZONE_BORDER_LAYER = "safety-zones-border";
export const SAFETY_ZONE_LABEL_LAYER = "safety-zones-label";

// airport boundary layers - rendered as inverted polygon (dark outside, transparent inside)
export const AIRPORT_BOUNDARY_SOURCE = "airport-boundary";
export const AIRPORT_BOUNDARY_FILL_LAYER = "airport-boundary-fill";
export const AIRPORT_BOUNDARY_LINE_LAYER = "airport-boundary-line";

const zoneBorderColors: Record<Exclude<SafetyZoneType, "AIRPORT_BOUNDARY">, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};

type Ring = number[][];

/** reverse a ring's winding order (required for MapLibre polygon holes). */
function reverseRing(ring: Ring): Ring {
  return [...ring].reverse();
}

/** build a world-covering polygon with the boundary's outer ring carved out as a hole. */
function buildInvertedPolygon(boundaryGeometry: SafetyZoneResponse["geometry"]) {
  const worldRing: Ring = [
    [-180, -90],
    [180, -90],
    [180, 90],
    [-180, 90],
    [-180, -90],
  ];

  // boundary outer ring, stripped to 2D, winding reversed to form a hole
  const outerRing: Ring = (boundaryGeometry.coordinates[0] ?? []).map(
    (c) => [c[0], c[1]] as [number, number],
  );

  return {
    type: "Feature" as const,
    properties: { entityType: "airport_boundary", role: "mask" },
    geometry: {
      type: "Polygon" as const,
      coordinates: [worldRing, reverseRing(outerRing)],
    },
  };
}

/** adds safety zone layers with hatch pattern fills and labels. */
export function addSafetyZoneLayers(
  map: MaplibreMap,
  zones: SafetyZoneResponse[],
): string[] {
  // split boundary zones from regular zones
  const regularZones = zones.filter(
    (z) => z.is_active && z.type !== "AIRPORT_BOUNDARY",
  );
  const boundaryZone = zones.find(
    (z) => z.type === "AIRPORT_BOUNDARY" && z.is_active,
  );

  // register hatch patterns per zone type
  for (const [type, color] of Object.entries(zoneBorderColors)) {
    const imgName = `hatch-${type.toLowerCase()}`;
    try { if (map.hasImage(imgName)) map.removeImage(imgName); } catch { /* noop */ }
    map.addImage(imgName, createHatchPattern(color));
  }

  map.addSource(SAFETY_ZONE_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: regularZones.map((z) => ({
        type: "Feature" as const,
        properties: {
          id: z.id,
          name: z.name,
          zoneType: z.type,
          borderColor: zoneBorderColors[z.type as keyof typeof zoneBorderColors],
          hatchImage: `hatch-${z.type.toLowerCase()}`,
          entityType: "safety_zone",
        },
        geometry: z.geometry,
      })),
    },
  });

  // solid color fill
  map.addLayer({
    id: SAFETY_ZONE_FILL_LAYER,
    type: "fill",
    source: SAFETY_ZONE_SOURCE,
    paint: {
      "fill-color": ["get", "borderColor"],
      "fill-opacity": 0.12,
    },
  });

  // hatch pattern overlay
  map.addLayer({
    id: SAFETY_ZONE_HATCH_LAYER,
    type: "fill",
    source: SAFETY_ZONE_SOURCE,
    paint: {
      "fill-pattern": ["get", "hatchImage"],
      "fill-opacity": 0.5,
    },
  });

  // dashed border
  map.addLayer({
    id: SAFETY_ZONE_BORDER_LAYER,
    type: "line",
    source: SAFETY_ZONE_SOURCE,
    paint: {
      "line-color": ["get", "borderColor"],
      "line-width": 2,
      "line-dasharray": [2, 2],
    },
  });

  // zone type label
  map.addLayer({
    id: SAFETY_ZONE_LABEL_LAYER,
    type: "symbol",
    source: SAFETY_ZONE_SOURCE,
    layout: {
      "text-field": ["get", "zoneType"],
      "text-size": 11,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-allow-overlap": false,
      "text-transform": "uppercase",
    },
    paint: {
      "text-color": ["get", "borderColor"],
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  const layerIds = [
    SAFETY_ZONE_FILL_LAYER,
    SAFETY_ZONE_HATCH_LAYER,
    SAFETY_ZONE_BORDER_LAYER,
    SAFETY_ZONE_LABEL_LAYER,
  ];

  // airport boundary: inverted polygon + dashed outline
  if (boundaryZone && boundaryZone.geometry) {
    const inverted = buildInvertedPolygon(boundaryZone.geometry);
    const outlineFeature = {
      type: "Feature" as const,
      properties: {
        id: boundaryZone.id,
        name: boundaryZone.name,
        entityType: "airport_boundary",
        role: "outline",
      },
      geometry: boundaryZone.geometry,
    };

    map.addSource(AIRPORT_BOUNDARY_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [inverted, outlineFeature],
      },
    });

    map.addLayer({
      id: AIRPORT_BOUNDARY_FILL_LAYER,
      type: "fill",
      source: AIRPORT_BOUNDARY_SOURCE,
      filter: ["==", ["get", "role"], "mask"],
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0.4,
        "fill-antialias": false,
      },
    });

    map.addLayer({
      id: AIRPORT_BOUNDARY_LINE_LAYER,
      type: "line",
      source: AIRPORT_BOUNDARY_SOURCE,
      filter: ["==", ["get", "role"], "outline"],
      paint: {
        "line-color": "#ffffff",
        "line-width": 2,
        "line-dasharray": [4, 4],
      },
    });

    layerIds.push(AIRPORT_BOUNDARY_FILL_LAYER, AIRPORT_BOUNDARY_LINE_LAYER);
  }

  return layerIds;
}
