import type { PointZ } from "./common";
import type { InspectionMethod, MissionStatus } from "./enums";

export interface MissionResponse {
  id: string;
  name: string;
  status: MissionStatus;
  airport_id: string;
  created_at: string;
  operator_notes: string | null;
  drone_profile_id: string | null;
  date_time: string | null;
  default_speed: number | null;
  default_altitude_offset: number | null;
  takeoff_coordinate: PointZ | null;
  landing_coordinate: PointZ | null;
}

export interface MissionDetailResponse extends MissionResponse {
  inspections: InspectionResponse[];
}

export interface InspectionResponse {
  id: string;
  mission_id: string;
  template_id: string;
  config_id: string | null;
  method: InspectionMethod;
  sequence_order: number;
  lha_ids: string[] | null;
}

export interface InspectionConfigOverride {
  altitude_offset?: number | null;
  speed_override?: number | null;
  measurement_density?: number | null;
  custom_tolerances?: Record<string, number> | null;
  density?: number | null;
  hover_duration?: number | null;
  horizontal_distance?: number | null;
  sweep_angle?: number | null;
  lha_ids?: string[] | null;
}

export interface MissionCreate {
  name: string;
  airport_id: string;
  operator_notes?: string | null;
  drone_profile_id?: string | null;
  date_time?: string | null;
  default_speed?: number | null;
  default_altitude_offset?: number | null;
  takeoff_coordinate?: PointZ | null;
  landing_coordinate?: PointZ | null;
}

export interface MissionUpdate {
  name?: string;
  operator_notes?: string | null;
  drone_profile_id?: string | null;
  date_time?: string | null;
  default_speed?: number | null;
  default_altitude_offset?: number | null;
  takeoff_coordinate?: PointZ | null;
  landing_coordinate?: PointZ | null;
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
