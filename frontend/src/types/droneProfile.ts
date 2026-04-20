export interface DroneProfileResponse {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  max_speed: number | null;
  max_climb_rate: number | null;
  max_altitude: number | null;
  battery_capacity: number | null;
  endurance_minutes: number | null;
  camera_resolution: string | null;
  camera_frame_rate: number | null;
  sensor_fov: number | null;
  weight: number | null;
  model_identifier: string | null;
  max_optical_zoom: number | null;
  created_at: string;
  updated_at: string;
  mission_count: number;
}

export interface DroneProfileCreate {
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  max_speed?: number | null;
  max_climb_rate?: number | null;
  max_altitude?: number | null;
  battery_capacity?: number | null;
  endurance_minutes?: number | null;
  camera_resolution?: string | null;
  camera_frame_rate?: number | null;
  sensor_fov?: number | null;
  weight?: number | null;
  model_identifier?: string | null;
  max_optical_zoom?: number | null;
}

export interface DroneProfileUpdate {
  name?: string;
  manufacturer?: string | null;
  model?: string | null;
  max_speed?: number | null;
  max_climb_rate?: number | null;
  max_altitude?: number | null;
  battery_capacity?: number | null;
  endurance_minutes?: number | null;
  camera_resolution?: string | null;
  camera_frame_rate?: number | null;
  sensor_fov?: number | null;
  weight?: number | null;
  model_identifier?: string | null;
  max_optical_zoom?: number | null;
}
