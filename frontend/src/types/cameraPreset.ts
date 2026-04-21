export type FocusMode = "AUTO" | "INFINITY";

export interface CameraPresetResponse {
  id: string;
  name: string;
  drone_profile_id: string | null;
  created_by: string | null;
  is_default: boolean;
  white_balance: string | null;
  iso: number | null;
  shutter_speed: string | null;
  focus_mode: FocusMode | null;
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
  focus_mode?: FocusMode | null;
}

export interface CameraPresetUpdate {
  name?: string;
  drone_profile_id?: string | null;
  is_default?: boolean;
  white_balance?: string | null;
  iso?: number | null;
  shutter_speed?: string | null;
  focus_mode?: FocusMode | null;
}
