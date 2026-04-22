import type { PointZ } from "./common";
import type { CaptureMode, ComputationStatus, FlightPlanScope, InspectionMethod, MissionStatus } from "./enums";

export type CameraMode = "AUTO" | "MANUAL";

export interface MissionResponse {
  id: string;
  name: string;
  status: MissionStatus;
  airport_id: string;
  created_at: string;
  updated_at: string;
  operator_notes: string | null;
  drone_profile_id: string | null;
  date_time: string | null;
  default_speed: number | null;
  measurement_speed_override: number | null;
  default_altitude_offset: number | null;
  takeoff_coordinate: PointZ | null;
  landing_coordinate: PointZ | null;
  default_capture_mode: CaptureMode | null;
  default_buffer_distance: number | null;
  camera_mode: CameraMode;
  default_white_balance: string | null;
  default_iso: number | null;
  default_shutter_speed: string | null;
  default_focus_mode: "AUTO" | "INFINITY" | null;
  transit_agl: number | null;
  require_perpendicular_runway_crossing: boolean;
  flight_plan_scope: FlightPlanScope;
  has_unsaved_map_changes: boolean;
  computation_status: ComputationStatus;
  computation_error: string | null;
  computation_started_at: string | null;
  inspection_count: number;
  estimated_duration: number | null;
}

export interface MissionDetailResponse extends MissionResponse {
  inspections: InspectionResponse[];
}

export interface InspectionConfigResponse {
  altitude_offset: number | null;
  angle_offset: number | null;
  measurement_speed_override: number | null;
  measurement_density: number | null;
  custom_tolerances: Record<string, number> | null;
  hover_duration: number | null;
  horizontal_distance: number | null;
  sweep_angle: number | null;
  vertical_profile_height: number | null;
  lha_ids: string[] | null;
  capture_mode: CaptureMode | null;
  recording_setup_duration: number | null;
  buffer_distance: number | null;
  height_above_lights: number | null;
  lateral_offset: number | null;
  distance_from_lha: number | null;
  height_above_lha: number | null;
  camera_gimbal_angle: number | null;
  selected_lha_id: string | null;
  lha_setting_angle_override_id: string | null;
  hover_bearing: number | null;
  hover_bearing_reference: "RUNWAY" | "COMPASS" | null;
  camera_mode: CameraMode | null;
  direction_reversed: boolean;
  direction_is_auto: boolean;
  white_balance: string | null;
  iso: number | null;
  shutter_speed: string | null;
  focus_mode: "AUTO" | "INFINITY" | null;
  optical_zoom: number | null;
  camera_preset_id: string | null;
}

export interface InspectionResponse {
  id: string;
  mission_id: string;
  template_id: string;
  config_id: string | null;
  method: InspectionMethod;
  sequence_order: number;
  lha_ids: string[] | null;
  config: InspectionConfigResponse | null;
}

export interface InspectionConfigOverride {
  altitude_offset?: number | null;
  angle_offset?: number | null;
  measurement_speed_override?: number | null;
  measurement_density?: number | null;
  custom_tolerances?: Record<string, number> | null;
  hover_duration?: number | null;
  horizontal_distance?: number | null;
  sweep_angle?: number | null;
  vertical_profile_height?: number | null;
  lha_ids?: string[] | null;
  capture_mode?: CaptureMode | null;
  recording_setup_duration?: number | null;
  buffer_distance?: number | null;
  height_above_lights?: number | null;
  lateral_offset?: number | null;
  distance_from_lha?: number | null;
  height_above_lha?: number | null;
  camera_gimbal_angle?: number | null;
  selected_lha_id?: string | null;
  lha_setting_angle_override_id?: string | null;
  hover_bearing?: number | null;
  hover_bearing_reference?: "RUNWAY" | "COMPASS" | null;
  camera_mode?: CameraMode | null;
  direction_reversed?: boolean;
  direction_is_auto?: boolean;
  white_balance?: string | null;
  iso?: number | null;
  shutter_speed?: string | null;
  focus_mode?: "AUTO" | "INFINITY" | null;
  optical_zoom?: number | null;
  camera_preset_id?: string | null;
}

export interface MissionCreate {
  name: string;
  airport_id: string;
  operator_notes?: string | null;
  drone_profile_id?: string | null;
  date_time?: string | null;
  default_speed?: number | null;
  measurement_speed_override?: number | null;
  default_altitude_offset?: number | null;
  takeoff_coordinate?: PointZ | null;
  landing_coordinate?: PointZ | null;
  default_capture_mode?: CaptureMode | null;
  default_buffer_distance?: number | null;
  camera_mode?: CameraMode;
  default_white_balance?: string | null;
  default_iso?: number | null;
  default_shutter_speed?: string | null;
  default_focus_mode?: "AUTO" | "INFINITY" | null;
  transit_agl?: number | null;
  require_perpendicular_runway_crossing?: boolean;
  flight_plan_scope?: FlightPlanScope;
}

export interface MissionUpdate {
  name?: string;
  operator_notes?: string | null;
  drone_profile_id?: string | null;
  date_time?: string | null;
  default_speed?: number | null;
  measurement_speed_override?: number | null;
  default_altitude_offset?: number | null;
  takeoff_coordinate?: PointZ | null;
  landing_coordinate?: PointZ | null;
  default_capture_mode?: CaptureMode | null;
  default_buffer_distance?: number | null;
  camera_mode?: CameraMode;
  default_white_balance?: string | null;
  default_iso?: number | null;
  default_shutter_speed?: string | null;
  default_focus_mode?: "AUTO" | "INFINITY" | null;
  transit_agl?: number | null;
  require_perpendicular_runway_crossing?: boolean;
  flight_plan_scope?: FlightPlanScope;
}

export interface InspectionCreate {
  template_id: string;
  method: InspectionMethod;
  config?: InspectionConfigOverride | null;
}

export interface InspectionUpdate {
  method?: InspectionMethod;
  sequence_order?: number;
  config?: InspectionConfigOverride | null;
}

export interface ReorderRequest {
  inspection_ids: string[];
}

export interface ComputationStatusResponse {
  computation_status: ComputationStatus;
  computation_error: string | null;
  computation_started_at: string | null;
}

export interface HeadingAssignment {
  inspection_id: string;
  sequence_order: number;
  direction_reversed: boolean;
  is_auto: boolean;
}

export interface HeadingAutoResponse {
  mission_id: string;
  assignments: HeadingAssignment[];
  total_distance_m: number;
  total_turn_deg: number;
  baseline_distance_m: number;
  baseline_turn_deg: number;
  improvement_pct: number;
  auto_inspection_count: number;
  pinned_inspection_count: number;
}
