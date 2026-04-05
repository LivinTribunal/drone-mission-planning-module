import type { LineStringZ, PointZ, PolygonZ } from "./common";
import type {
  LampType,
  ObstacleType,
  PAPISide,
  SafetyZoneType,
  SurfaceType,
} from "./enums";

export interface AirportResponse {
  id: string;
  icao_code: string;
  name: string;
  city: string | null;
  country: string | null;
  elevation: number;
  location: PointZ;
  terrain_source: string;
  has_dem: boolean;
}

export interface AirportSummaryResponse extends AirportResponse {
  surfaces_count: number;
  agls_count: number;
  missions_count: number;
}

export interface AirportDetailResponse extends AirportResponse {
  surfaces: SurfaceResponse[];
  obstacles: ObstacleResponse[];
  safety_zones: SafetyZoneResponse[];
}

export interface SurfaceResponse {
  id: string;
  airport_id: string;
  identifier: string;
  surface_type: SurfaceType;
  geometry: LineStringZ;
  boundary: PolygonZ | null;
  heading: number | null;
  length: number | null;
  width: number | null;
  threshold_position: PointZ | null;
  end_position: PointZ | null;
  agls: AGLResponse[];
}

export interface ObstacleResponse {
  id: string;
  airport_id: string;
  name: string;
  position: PointZ;
  height: number;
  radius: number;
  geometry: PolygonZ;
  type: ObstacleType;
}

export interface SafetyZoneResponse {
  id: string;
  airport_id: string;
  name: string;
  type: SafetyZoneType;
  geometry: PolygonZ;
  altitude_floor: number | null;
  altitude_ceiling: number | null;
  is_active: boolean;
}

export interface AGLResponse {
  id: string;
  surface_id: string;
  agl_type: string;
  name: string;
  position: PointZ;
  side: PAPISide | null;
  glide_slope_angle: number | null;
  distance_from_threshold: number | null;
  offset_from_centerline: number | null;
  lhas: LHAResponse[];
}

export interface LHAResponse {
  id: string;
  agl_id: string;
  unit_number: number;
  setting_angle: number;
  transition_sector_width: number | null;
  lamp_type: LampType;
  position: PointZ;
}

export interface AirportCreate {
  icao_code: string;
  name: string;
  city?: string | null;
  country?: string | null;
  elevation: number;
  location: PointZ;
}

export interface AirportUpdate {
  name?: string;
  city?: string | null;
  country?: string | null;
  elevation?: number;
  location?: PointZ;
}

export interface TerrainCoverage {
  bounds: number[];
  resolution: number[];
}

export interface TerrainUploadResponse {
  terrain_source: string;
  coverage: TerrainCoverage;
}

export interface TerrainDownloadResponse {
  terrain_source: string;
  points_downloaded: number;
  coverage: TerrainCoverage;
}

export interface SurfaceCreate {
  identifier: string;
  surface_type: SurfaceType;
  geometry: LineStringZ;
  boundary?: PolygonZ;
  heading?: number | null;
  length?: number | null;
  width?: number | null;
  threshold_position?: PointZ | null;
  end_position?: PointZ | null;
}

export interface SurfaceUpdate {
  identifier?: string;
  geometry?: LineStringZ;
  boundary?: PolygonZ;
  heading?: number | null;
  length?: number | null;
  width?: number | null;
  threshold_position?: PointZ | null;
  end_position?: PointZ | null;
}

export interface ObstacleCreate {
  name: string;
  position: PointZ;
  height: number;
  radius: number;
  geometry: PolygonZ;
  type: ObstacleType;
}

export interface ObstacleUpdate {
  name?: string;
  position?: PointZ;
  height?: number;
  radius?: number;
  geometry?: PolygonZ;
  type?: ObstacleType;
}

export interface SafetyZoneCreate {
  name: string;
  type: SafetyZoneType;
  geometry: PolygonZ;
  altitude_floor?: number | null;
  altitude_ceiling?: number | null;
  is_active?: boolean;
}

export interface SafetyZoneUpdate {
  name?: string;
  type?: SafetyZoneType;
  geometry?: PolygonZ;
  altitude_floor?: number | null;
  altitude_ceiling?: number | null;
  is_active?: boolean;
}

export interface AGLCreate {
  agl_type: string;
  name: string;
  position: PointZ;
  side?: PAPISide | null;
  glide_slope_angle?: number | null;
  distance_from_threshold?: number | null;
  offset_from_centerline?: number | null;
}

export interface AGLUpdate {
  agl_type?: string;
  name?: string;
  position?: PointZ;
  side?: PAPISide | null;
  glide_slope_angle?: number | null;
  distance_from_threshold?: number | null;
  offset_from_centerline?: number | null;
}

export interface LHACreate {
  unit_number: number;
  setting_angle: number;
  transition_sector_width?: number | null;
  lamp_type: LampType;
  position: PointZ;
}

export interface LHAUpdate {
  unit_number?: number;
  setting_angle?: number;
  transition_sector_width?: number | null;
  lamp_type?: LampType;
  position?: PointZ;
}
