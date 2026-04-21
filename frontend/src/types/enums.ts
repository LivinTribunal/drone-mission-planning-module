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
  | "RECORDING"
  | "RECORDING_STOP";

export type CaptureMode = "VIDEO_CAPTURE" | "PHOTO_CAPTURE";

export type ExportFormat =
  | "MAVLINK"
  | "KML"
  | "KMZ"
  | "JSON"
  | "UGCS"
  | "WPML"
  | "CSV"
  | "GPX"
  | "LITCHI"
  | "DRONEDEPLOY";

export type InspectionMethod =
  | "VERTICAL_PROFILE"
  | "HORIZONTAL_RANGE"
  | "FLY_OVER"
  | "PARALLEL_SIDE_SWEEP"
  | "HOVER_POINT_LOCK"
  | "MEHT_CHECK";

export type SafetyZoneType =
  | "CTR"
  | "RESTRICTED"
  | "PROHIBITED"
  | "TEMPORARY_NO_FLY"
  | "AIRPORT_BOUNDARY";

export type ObstacleType =
  | "BUILDING"
  | "TOWER"
  | "ANTENNA"
  | "VEGETATION"
  | "OTHER";

export type LampType = "HALOGEN" | "LED";

export type PAPISide = "LEFT" | "RIGHT";

export type SurfaceType = "RUNWAY" | "TAXIWAY";

export type FlightPlanScope = "FULL" | "NO_TAKEOFF_LANDING" | "MEASUREMENTS_ONLY";

export type ConstraintType = "NO_FLY" | "ALTITUDE_LIMIT" | "SPEED_LIMIT";

export type ComputationStatus = "IDLE" | "COMPUTING" | "COMPLETED" | "FAILED";

export type UserRole = "OPERATOR" | "COORDINATOR" | "SUPER_ADMIN";
