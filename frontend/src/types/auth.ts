import type { UserRole } from "@/types/enums";

export interface AirportSummary {
  id: string;
  icao_code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  airports: AirportSummary[];
}
