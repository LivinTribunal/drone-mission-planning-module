export type MissionStatus =
  | "DRAFT"
  | "PLANNED"
  | "VALIDATED"
  | "EXPORTED"
  | "COMPLETED"
  | "CANCELLED";

export type WaypointType =
  | "TAKEOFF"
  | "TRANSIT"
  | "MEASUREMENT"
  | "HOVER"
  | "LANDING";

export type CameraAction =
  | "NONE"
  | "PHOTO_CAPTURE"
  | "RECORDING_START"
  | "RECORDING_STOP";

export type ExportFormat = "MAVLINK" | "KML" | "KMZ" | "JSON";

export type InspectionMethod = "VERTICAL_PROFILE" | "ANGULAR_SWEEP";

export type SafetyZoneType =
  | "CTR"
  | "RESTRICTED"
  | "PROHIBITED"
  | "TEMPORARY_NO_FLY";

export type ObstacleType =
  | "BUILDING"
  | "TOWER"
  | "ANTENNA"
  | "VEGETATION"
  | "OTHER";

export type LampType = "HALOGEN" | "LED";

export type PAPISide = "LEFT" | "RIGHT";

export type SurfaceType = "RUNWAY" | "TAXIWAY" | "APRON" | "HELIPAD";

export type ConstraintType = "NO_FLY" | "ALTITUDE_LIMIT" | "SPEED_LIMIT";
