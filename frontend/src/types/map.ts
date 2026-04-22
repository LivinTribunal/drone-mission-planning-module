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
import type { FlightPlanScope, MissionStatus } from "./enums";
import type { PointZ } from "./common";

export interface MapLayerConfig {
  runways: boolean;
  taxiways: boolean;
  obstacles: boolean;
  safetyZones: boolean;
  aglSystems: boolean;
  bufferZones: boolean;
  simplifiedTrajectory: boolean;
  trajectory: boolean;
  transitWaypoints: boolean;
  measurementWaypoints: boolean;
  path: boolean;
  takeoffLanding: boolean;
  cameraHeading: boolean;
  pathHeading: boolean;
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
    seq_min?: number;
    seq_max?: number;
    alt_min?: number;
    alt_max?: number;
    heading?: number | null;
    speed?: number | null;
    camera_action?: string | null;
    camera_target?: PointZ | null;
    gimbal_pitch?: number | null;
    hover_duration?: number | null;
  };
}

export type MapFeature =
  | MapFeatureSurface
  | MapFeatureObstacle
  | MapFeatureSafetyZone
  | MapFeatureAGL
  | MapFeatureLHA
  | MapFeatureWaypoint;

// request to recenter the map/camera on a feature. the key is a monotonic
// counter bumped by the producer so the same feature can be re-located back
// to back (set state equality would otherwise swallow the event).
export interface LocateRequest {
  feature: MapFeature;
  key: number;
}

export interface AirportMapProps {
  airport: AirportDetailResponse;
  layers?: Partial<MapLayerConfig>;
  interactive?: boolean;
  showLayerPanel?: boolean;
  showLegend?: boolean;
  showPoiInfo?: boolean;
  showTerrainToggle?: boolean;
  onFeatureClick?: (feature: MapFeature | null) => void;
  children?: ReactNode;
  showWaypointList?: boolean;
  simplifiedTrajectory?: boolean;
  waypoints?: WaypointResponse[];
  selectedWaypointId?: string | null;
  onWaypointClick?: (id: string | null) => void;
  terrainMode?: "map" | "satellite";
  onTerrainChange?: (mode: "map" | "satellite") => void;
  missionStatus?: MissionStatus;
  flightPlanScope?: FlightPlanScope;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  visibleInspectionIds?: Set<string>;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  inspectionIndexMap?: Record<string, number>;
  onLayerChange?: (layers: MapLayerConfig) => void;
  leftPanelChildren?: ReactNode;
  useTakeoffAsLanding?: boolean;
  onPlaceTakeoff?: () => void;
  onPlaceLanding?: () => void;
  measureData?: {
    points: GeoJSON.FeatureCollection;
    lines: GeoJSON.FeatureCollection;
    labels: GeoJSON.FeatureCollection;
  };
  onMeasureClear?: () => void;
  onMeasureFinish?: () => void;
  onMeasureMouseMove?: (lng: number, lat: number) => void;
  isMeasureDrawing?: boolean;
  headingData?: {
    point: GeoJSON.FeatureCollection;
    line: GeoJSON.FeatureCollection;
    label: GeoJSON.FeatureCollection;
  };
  onHeadingClear?: () => void;
  headingOrigin?: [number, number] | null;
  isHeadingDrawing?: boolean;
  onWaypointDrag?: (waypointId: string, newPosition: [number, number, number]) => void;
  onTransitInsert?: (position: [number, number, number], afterSequence: number) => void;
  onTransitDelete?: (waypointId: string) => void;
  onInfraPointDrag?: (featureType: "agl" | "lha", featureId: string, newPosition: [number, number, number]) => void;
  zoomPercent?: number;
  onZoomChange?: (percent: number) => void;
  focusFeature?: MapFeature | null;
  locateRequest?: LocateRequest | null;
  showZoomControls?: boolean;
  showCompass?: boolean;
  is3D?: boolean;
  onToggle3D?: (val: boolean) => void;
  onBearingChange?: (bearing: number) => void;
  bearingResetKey?: number;
  showHelpPanel?: boolean;
  helpVariant?: "full" | "preview";
  highlightedWaypointIds?: string[];
  highlightSeverity?: string;
  selectedWarning?: import("./flightPlan").ValidationViolation | null;
  onWarningClose?: () => void;
}

export type FlyAlongSpeed = 1 | 2 | 5 | 10;

export type FlyAlongStatus = "idle" | "playing" | "paused";

export interface FlyAlongState {
  status: FlyAlongStatus;
  currentIndex: number;
  speed: FlyAlongSpeed;
  progress: number;
}

export type DrawingTool =
  | "pan"
  | "zoom"
  | "zoomReset"
  | "select"
  | "move"
  | "measurement"
  | "heading"
  | "drawPolygon"
  | "drawCircle"
  | "drawRectangle"
  | "placePoint"
  | "geoJsonEditor";

export const DEFAULT_LAYER_CONFIG: MapLayerConfig = {
  runways: true,
  taxiways: true,
  obstacles: true,
  safetyZones: true,
  aglSystems: true,
  bufferZones: false,
  simplifiedTrajectory: false,
  trajectory: true,
  transitWaypoints: true,
  measurementWaypoints: true,
  path: true,
  takeoffLanding: true,
  cameraHeading: false,
  pathHeading: true,
};
