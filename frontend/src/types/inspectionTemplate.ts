import type { CaptureMode, InspectionMethod } from "./enums";

export interface InspectionConfigResponse {
  id: string;
  altitude_offset: number | null;
  speed_override: number | null;
  measurement_density: number | null;
  custom_tolerances: Record<string, number> | null;
  density: number | null;
  hover_duration: number | null;
  horizontal_distance: number | null;
  sweep_angle: number | null;
  lha_ids: string[] | null;
  capture_mode: CaptureMode | null;
  recording_setup_duration: number | null;
}

export interface InspectionTemplateResponse {
  id: string;
  name: string;
  description: string | null;
  angular_tolerances: Record<string, number> | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  default_config: InspectionConfigResponse | null;
  target_agl_ids: string[];
  methods: InspectionMethod[];
  mission_count: number;
}

export interface InspectionTemplateCreate {
  name: string;
  description?: string | null;
  angular_tolerances?: Record<string, number> | null;
  target_agl_ids?: string[];
  methods?: InspectionMethod[];
  default_config?: Omit<InspectionConfigResponse, "id"> | null;
}

export interface InspectionTemplateUpdate {
  name?: string;
  description?: string | null;
  angular_tolerances?: Record<string, number> | null;
  target_agl_ids?: string[];
  methods?: InspectionMethod[];
  default_config?: Omit<InspectionConfigResponse, "id"> | null;
}
