import type { PointZ } from "./common";
import type { CameraAction, MissionStatus, WaypointType } from "./enums";

export interface WaypointResponse {
  id: string;
  flight_plan_id: string;
  inspection_id: string | null;
  sequence_order: number;
  position: PointZ;
  heading: number | null;
  speed: number | null;
  hover_duration: number | null;
  camera_action: CameraAction | null;
  waypoint_type: WaypointType;
  camera_target: PointZ | null;
  gimbal_pitch: number | null;
}

export type ViolationSeverity = "violation" | "warning" | "suggestion";

export interface ValidationViolation {
  id: string;
  category: ViolationSeverity;
  is_warning: boolean;
  message: string;
  constraint_id: string | null;
  violation_kind: string | null;
  // severity is identical to category - kept for backward compat
  severity: ViolationSeverity;
  constraint_name: string | null;
  waypoint_ref: string | null;
  waypoint_ids: string[];
}

export interface ValidationResultResponse {
  id: string;
  passed: boolean;
  validated_at: string | null;
  violations: ValidationViolation[];
}

export interface InspectionFlightStats {
  inspection_id: string;
  min_altitude_agl: number;
  max_altitude_agl: number;
  min_altitude_msl: number;
  max_altitude_msl: number;
  waypoint_count: number;
  segment_duration: number | null;
}

export interface FlightPlanResponse {
  id: string;
  mission_id: string;
  airport_id: string;
  total_distance: number | null;
  estimated_duration: number | null;
  is_validated: boolean;
  generated_at: string | null;
  waypoints: WaypointResponse[];
  validation_result: ValidationResultResponse | null;
  min_altitude_agl: number | null;
  max_altitude_agl: number | null;
  min_altitude_msl: number | null;
  max_altitude_msl: number | null;
  transit_speed: number | null;
  average_speed: number | null;
  inspection_stats: InspectionFlightStats[];
}

export interface GenerateTrajectoryResponse {
  flight_plan: FlightPlanResponse;
  mission_status: MissionStatus;
}

export interface WaypointPositionUpdate {
  waypoint_id: string;
  position: PointZ;
  camera_target?: PointZ | null;
}

export interface WaypointBatchUpdateRequest {
  updates: WaypointPositionUpdate[];
}
