import type { Map as MaplibreMap } from "maplibre-gl";
import type { SafetyZoneResponse } from "@/types/airport";
import type { SafetyZoneType } from "@/types/enums";
import { createHatchPattern } from "./mapImages";

export const SAFETY_ZONE_SOURCE = "safety-zones";
export const SAFETY_ZONE_FILL_LAYER = "safety-zones-fill";
export const SAFETY_ZONE_HATCH_LAYER = "safety-zones-hatch";
export const SAFETY_ZONE_BORDER_LAYER = "safety-zones-border";
export const SAFETY_ZONE_LABEL_LAYER = "safety-zones-label";

const zoneBorderColors: Record<SafetyZoneType, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};

/** adds safety zone layers with hatch pattern fills and labels. */
export function addSafetyZoneLayers(
  map: MaplibreMap,
  zones: SafetyZoneResponse[],
): string[] {
  const activeZones = zones.filter((z) => z.is_active);

  // register hatch patterns per zone type
  for (const [type, color] of Object.entries(zoneBorderColors)) {
    const imgName = `hatch-${type.toLowerCase()}`;
    if (!map.hasImage(imgName)) {
      map.addImage(imgName, createHatchPattern(color));
    }
  }

  map.addSource(SAFETY_ZONE_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: activeZones.map((z) => ({
        type: "Feature" as const,
        properties: {
          id: z.id,
          name: z.name,
          zoneType: z.type,
          borderColor: zoneBorderColors[z.type],
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

  return [
    SAFETY_ZONE_FILL_LAYER,
    SAFETY_ZONE_HATCH_LAYER,
    SAFETY_ZONE_BORDER_LAYER,
    SAFETY_ZONE_LABEL_LAYER,
  ];
}
