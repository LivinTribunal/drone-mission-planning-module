import type { Map as MaplibreMap } from "maplibre-gl";
import type { SafetyZoneResponse } from "@/types/airport";
import type { SafetyZoneType } from "@/types/enums";

export const SAFETY_ZONE_SOURCE = "safety-zones";
export const SAFETY_ZONE_FILL_LAYER = "safety-zones-fill";
export const SAFETY_ZONE_BORDER_LAYER = "safety-zones-border";

const zoneBorderColors: Record<SafetyZoneType, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};

export function addSafetyZoneLayers(
  map: MaplibreMap,
  zones: SafetyZoneResponse[],
): string[] {
  const activeZones = zones.filter((z) => z.is_active);

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
          entityType: "safety_zone",
        },
        geometry: z.geometry,
      })),
    },
  });

  map.addLayer({
    id: SAFETY_ZONE_FILL_LAYER,
    type: "fill",
    source: SAFETY_ZONE_SOURCE,
    paint: {
      "fill-color": ["get", "borderColor"],
      "fill-opacity": 0.15,
    },
  });

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

  return [SAFETY_ZONE_FILL_LAYER, SAFETY_ZONE_BORDER_LAYER];
}
