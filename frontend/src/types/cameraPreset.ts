import type {
  WHITE_BALANCE_OPTIONS,
  ISO_OPTIONS,
  SHUTTER_SPEED_OPTIONS,
} from "@/constants/camera";

export type FocusMode = "AUTO" | "INFINITY";
export type WhiteBalance = typeof WHITE_BALANCE_OPTIONS[number]["value"];
export type Iso = typeof ISO_OPTIONS[number];
export type ShutterSpeed = typeof SHUTTER_SPEED_OPTIONS[number];

export interface CameraPresetResponse {
  id: string;
  name: string;
  drone_profile_id: string | null;
  created_by: string | null;
  is_default: boolean;
  white_balance: WhiteBalance | null;
  iso: Iso | null;
  shutter_speed: ShutterSpeed | null;
  focus_mode: FocusMode | null;
  created_at: string;
  updated_at: string;
}

export interface CameraPresetCreate {
  name: string;
  drone_profile_id?: string | null;
  is_default?: boolean;
  white_balance?: WhiteBalance | null;
  iso?: Iso | null;
  shutter_speed?: ShutterSpeed | null;
  focus_mode?: FocusMode | null;
}

export interface CameraPresetUpdate {
  name?: string;
  drone_profile_id?: string | null;
  is_default?: boolean;
  white_balance?: WhiteBalance | null;
  iso?: Iso | null;
  shutter_speed?: ShutterSpeed | null;
  focus_mode?: FocusMode | null;
}
