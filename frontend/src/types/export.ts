export type ExportFormat =
  | "KML"
  | "KMZ"
  | "JSON"
  | "MAVLINK"
  | "UGCS"
  | "WPML"
  | "CSV"
  | "GPX"
  | "LITCHI"
  | "DRONEDEPLOY";

export interface ExportRequest {
  formats: ExportFormat[];
  include_geozones: boolean;
  include_runway_buffers: boolean;
}
