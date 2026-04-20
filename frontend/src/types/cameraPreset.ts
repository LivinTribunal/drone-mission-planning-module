export interface CameraPresetResponse {
  id: string;
  name: string;
  drone_profile_id: string | null;
  created_by: string | null;
  is_default: boolean;
  white_balance: string | null;
  iso: number | null;
  shutter_speed: string | null;
  focus_mode: string | null;
  focus_distance_m: number | null;
  optical_zoom: number | null;
  created_at: string;
  updated_at: string;
}

export interface CameraPresetCreate {
  name: string;
  drone_profile_id?: string | null;
  is_default?: boolean;
  white_balance?: string | null;
  iso?: number | null;
  shutter_speed?: string | null;
  focus_mode?: string | null;
  focus_distance_m?: number | null;
  optical_zoom?: number | null;
}

export interface CameraPresetUpdate {
  name?: string;
  drone_profile_id?: string | null;
  is_default?: boolean;
  white_balance?: string | null;
  iso?: number | null;
  shutter_speed?: string | null;
  focus_mode?: string | null;
  focus_distance_m?: number | null;
  optical_zoom?: number | null;
}
