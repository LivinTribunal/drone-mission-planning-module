import type { ExportFormat } from "@/types/export";

// formats that can carry keep-out polygons alongside waypoints.
// mavlink/json/ugcs enforce at flight time; kmz/kml are advisory overlays.
export const GEOZONE_CAPABLE_FORMATS: ReadonlySet<ExportFormat> = new Set([
  "MAVLINK",
  "JSON",
  "UGCS",
  "KMZ",
  "KML",
]);

// subset that actually enforces fences on the aircraft
export const GEOZONE_ENFORCED_FORMATS: ReadonlySet<ExportFormat> = new Set([
  "MAVLINK",
  "JSON",
  "UGCS",
]);

// subset where the drone gets the polygons but will not refuse to cross them
export const GEOZONE_ADVISORY_FORMATS: ReadonlySet<ExportFormat> = new Set([
  "KMZ",
  "KML",
]);

export function isGeozoneCapableFormat(fmt: string): fmt is ExportFormat {
  return GEOZONE_CAPABLE_FORMATS.has(fmt as ExportFormat);
}

export function anyGeozoneCapable(formats: Iterable<string>): boolean {
  for (const f of formats) {
    if (isGeozoneCapableFormat(f)) return true;
  }
  return false;
}

export function anyGeozoneAdvisory(formats: Iterable<string>): boolean {
  for (const f of formats) {
    if (GEOZONE_ADVISORY_FORMATS.has(f as ExportFormat)) return true;
  }
  return false;
}

export function anyGeozoneEnforced(formats: Iterable<string>): boolean {
  for (const f of formats) {
    if (GEOZONE_ENFORCED_FORMATS.has(f as ExportFormat)) return true;
  }
  return false;
}
