import type { DroneProfileResponse } from "./droneProfile";

export interface DroneResponse {
  id: string;
  airport_id: string;
  drone_profile_id: string;
  name: string;
  serial_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  drone_profile: DroneProfileResponse | null;
  mission_count: number;
}

export interface DroneCreate {
  drone_profile_id: string;
  name: string;
  serial_number?: string | null;
  notes?: string | null;
}

export interface DroneUpdate {
  drone_profile_id?: string | null;
  name?: string | null;
  serial_number?: string | null;
  notes?: string | null;
}
