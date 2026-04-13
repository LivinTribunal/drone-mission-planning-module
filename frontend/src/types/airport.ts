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
  default_drone_profile_id: string | null;
  terrain_source: "FLAT" | "DEM_UPLOAD" | "DEM_API";
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
  buffer_distance: number;
  heading: number | null;
  length: number | null;
  width: number | null;
  threshold_position: PointZ | null;
  end_position: PointZ | null;
  touchpoint_latitude: number | null;
  touchpoint_longitude: number | null;
  touchpoint_altitude: number | null;
  agls: AGLResponse[];
}

export type AglType = "PAPI" | "RUNWAY_EDGE_LIGHTS";

export interface ObstacleResponse {
  id: string;
  airport_id: string;
  name: string;
  height: number;
  boundary: PolygonZ;
  buffer_distance: number;
  type: ObstacleType;
  position?: PointZ;
  radius?: number;
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
  agl_type: AglType;
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
  // null for PAPI lhas before coordinator fills the angle in manually
  setting_angle: number | null;
  transition_sector_width: number | null;
  lamp_type: LampType;
  position: PointZ;
  tolerance: number | null;
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

export interface BulkChangeDroneResponse {
  updated_count: number;
  regressed_count: number;
  mission_ids: string[];
}

export interface TerrainCoverage {
  bounds: [number, number, number, number];
  resolution: [number, number];
}

export interface TerrainUploadResponse {
  terrain_source: "FLAT" | "DEM_UPLOAD" | "DEM_API";
  coverage: TerrainCoverage;
}

export interface TerrainDownloadResponse {
  terrain_source: "FLAT" | "DEM_UPLOAD" | "DEM_API";
  points_downloaded: number;
  coverage: TerrainCoverage;
}

export interface SurfaceCreate {
  identifier: string;
  surface_type: SurfaceType;
  geometry: LineStringZ;
  boundary?: PolygonZ;
  buffer_distance?: number;
  heading?: number | null;
  length?: number | null;
  width?: number | null;
  threshold_position?: PointZ | null;
  end_position?: PointZ | null;
  touchpoint_latitude?: number | null;
  touchpoint_longitude?: number | null;
  touchpoint_altitude?: number | null;
}

export interface SurfaceUpdate {
  identifier?: string;
  geometry?: LineStringZ;
  // null clears the polygon boundary on the backend; undefined leaves it untouched
  boundary?: PolygonZ | null;
  buffer_distance?: number;
  heading?: number | null;
  length?: number | null;
  width?: number | null;
  threshold_position?: PointZ | null;
  end_position?: PointZ | null;
  touchpoint_latitude?: number | null;
  touchpoint_longitude?: number | null;
  touchpoint_altitude?: number | null;
}

export interface LHABulkGenerateRequest {
  first_position: PointZ;
  last_position: PointZ;
  spacing_m: number;
  setting_angle?: number | null;
  tolerance?: number | null;
  lamp_type?: "HALOGEN" | "LED";
}

export interface LHABulkGenerateResponse {
  generated: LHAResponse[];
}

export interface ObstacleCreate {
  name: string;
  height: number;
  boundary: PolygonZ;
  buffer_distance?: number;
  type: ObstacleType;
}

export interface ObstacleUpdate {
  name?: string;
  height?: number;
  boundary?: PolygonZ;
  buffer_distance?: number;
  type?: ObstacleType;
  preserve_altitude?: boolean;
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
  agl_type: AglType;
  name: string;
  position: PointZ;
  side?: PAPISide | null;
  glide_slope_angle?: number | null;
  distance_from_threshold?: number | null;
  offset_from_centerline?: number | null;
}

export interface AGLUpdate {
  agl_type?: AglType;
  name?: string;
  position?: PointZ;
  side?: PAPISide | null;
  glide_slope_angle?: number | null;
  distance_from_threshold?: number | null;
  offset_from_centerline?: number | null;
  preserve_altitude?: boolean;
}

export interface LHACreate {
  unit_number: number;
  setting_angle: number | null;
  transition_sector_width?: number | null;
  lamp_type: LampType;
  position: PointZ;
  tolerance?: number | null;
}

export interface LHAUpdate {
  unit_number?: number;
  setting_angle?: number | null;
  transition_sector_width?: number | null;
  lamp_type?: LampType;
  position?: PointZ;
  tolerance?: number | null;
  preserve_altitude?: boolean;
}

export interface SurfaceDimensions {
  length: number | null;
  width: number | null;
  heading: number | null;
}

export interface SurfaceRecalculateResponse {
  current: SurfaceDimensions;
  recalculated: SurfaceDimensions;
}

export interface ObstacleDimensions {
  length: number | null;
  width: number | null;
  heading: number | null;
  radius: number | null;
}

export interface ObstacleRecalculateResponse {
  current: ObstacleDimensions;
  recalculated: ObstacleDimensions;
}
