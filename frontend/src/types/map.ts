import type {
  AirportDetailResponse,
  SurfaceResponse,
  ObstacleResponse,
  SafetyZoneResponse,
  AGLResponse,
  LHAResponse,
} from "./airport";

export interface MapLayerConfig {
  runways: boolean;
  taxiways: boolean;
  obstacles: boolean;
  safetyZones: boolean;
  aglSystems: boolean;
}

export type MapFeatureType =
  | "surface"
  | "obstacle"
  | "safety_zone"
  | "agl"
  | "lha";

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

export type MapFeature =
  | MapFeatureSurface
  | MapFeatureObstacle
  | MapFeatureSafetyZone
  | MapFeatureAGL
  | MapFeatureLHA;

export interface AirportMapProps {
  airport: AirportDetailResponse;
  layers?: Partial<MapLayerConfig>;
  interactive?: boolean;
  showLayerPanel?: boolean;
  showLegend?: boolean;
  showPoiInfo?: boolean;
  showTerrainToggle?: boolean;
  onFeatureClick?: (feature: MapFeature) => void;
  children?: React.ReactNode;
}

export const DEFAULT_LAYER_CONFIG: MapLayerConfig = {
  runways: true,
  taxiways: true,
  obstacles: true,
  safetyZones: true,
  aglSystems: true,
};
