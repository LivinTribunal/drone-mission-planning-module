import type { PointZ } from "./common";
import type { CameraAction, WaypointType } from "./enums";

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
  is_warning: boolean;
  message: string;
  constraint_id: string | null;
  violation_kind: string | null;
  severity: ViolationSeverity;
  constraint_name: string | null;
  waypoint_ref: string | null;
}

export interface ValidationResultResponse {
  id: string;
  passed: boolean;
  validated_at: string | null;
  violations: ValidationViolation[];
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
}

export interface GenerateTrajectoryResponse {
  flight_plan: FlightPlanResponse;
}

export interface WaypointPositionUpdate {
  waypoint_id: string;
  position: PointZ;
  camera_target?: PointZ | null;
}

export interface WaypointBatchUpdateRequest {
  updates: WaypointPositionUpdate[];
}
