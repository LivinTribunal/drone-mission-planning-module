import type { ReactNode } from "react";
import type {
  AirportDetailResponse,
  SurfaceResponse,
  ObstacleResponse,
  SafetyZoneResponse,
  AGLResponse,
  LHAResponse,
} from "./airport";
import type { WaypointResponse } from "./flightPlan";
import type { MissionStatus } from "./enums";
import type { PointZ } from "./common";

export interface MapLayerConfig {
  runways: boolean;
  taxiways: boolean;
  obstacles: boolean;
  safetyZones: boolean;
  aglSystems: boolean;
  waypoints: boolean;
}

export type MapFeatureType =
  | "surface"
  | "obstacle"
  | "safety_zone"
  | "agl"
  | "lha"
  | "waypoint";

export interface MapFeatureSurface {
  type: "surface";
  data: SurfaceResponse;
}

export interface MapFeatureObstacle {
  type: "obstacle";
  data: ObstacleResponse;
}

export interface MapFeatureSafetyZone {
  type: "safety_zone";
  data: SafetyZoneResponse;
}

export interface MapFeatureAGL {
  type: "agl";
  data: AGLResponse;
}

export interface MapFeatureLHA {
  type: "lha";
  data: LHAResponse;
}

export interface MapFeatureWaypoint {
  type: "waypoint";
  data: {
    id: string;
    waypoint_type: string;
    sequence_order: number;
    position: PointZ;
    stack_count: number;
    alt_min?: number;
    alt_max?: number;
  };
}

export type MapFeature =
  | MapFeatureSurface
  | MapFeatureObstacle
  | MapFeatureSafetyZone
  | MapFeatureAGL
  | MapFeatureLHA
  | MapFeatureWaypoint;

export interface AirportMapProps {
  airport: AirportDetailResponse;
  layers?: Partial<MapLayerConfig>;
  interactive?: boolean;
  showLayerPanel?: boolean;
  showLegend?: boolean;
  showPoiInfo?: boolean;
  showTerrainToggle?: boolean;
  onFeatureClick?: (feature: MapFeature) => void;
  children?: ReactNode;
  waypoints?: WaypointResponse[];
  selectedWaypointId?: string | null;
  onWaypointClick?: (id: string | null) => void;
  terrainMode?: "map" | "satellite";
  onTerrainChange?: (mode: "map" | "satellite") => void;
  missionStatus?: MissionStatus;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  inspectionIndexMap?: Record<string, number>;
}

export const DEFAULT_LAYER_CONFIG: MapLayerConfig = {
  runways: true,
  taxiways: true,
  obstacles: true,
  safetyZones: true,
  aglSystems: true,
  waypoints: true,
};
