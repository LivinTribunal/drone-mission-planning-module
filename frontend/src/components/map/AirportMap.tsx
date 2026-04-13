import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus, Flag } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const LazyCesiumMapViewer = lazy(() => import("./CesiumMapViewer"));

import type { AirportMapProps, MapFeature, MapLayerConfig } from "@/types/map";
import type { WaypointResponse } from "@/types/flightPlan";
import type { PointZ } from "@/types/common";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import useCesiumSync from "@/hooks/useCesiumSync";
import { MapTool } from "@/hooks/useMapTools";
import {
  TOOL_CURSOR_MOVE,
  TOOL_CURSOR_MEASURE,
  TOOL_CURSOR_HEADING,
} from "@/utils/cursors";
import { computeBearing as computeBearingFn } from "@/utils/geo";
import { registerAllMapImages } from "./layers/mapImages";
import {
  addSurfaceLayers,
  RUNWAY_SOURCE,
  RUNWAY_FILL_LAYER,
  RUNWAY_STROKE_LAYER,
  RUNWAY_CENTERLINE_LAYER,
  RUNWAY_LABEL_LAYER,
  RUNWAY_POLYGON_SOURCE,
  TAXIWAY_SOURCE,
  TAXIWAY_FILL_LAYER,
  TAXIWAY_STROKE_LAYER,
  TAXIWAY_CENTERLINE_LAYER,
  TAXIWAY_LABEL_LAYER,
  TAXIWAY_POLYGON_SOURCE,
  TOUCHPOINT_SOURCE,
} from "./layers/surfaceLayers";
import {
  addObstacleLayers,
  addBufferZoneLayers,
  OBSTACLE_SOURCE,
  OBSTACLE_BOUNDARY_SOURCE,
  OBSTACLE_ICON_LAYER,
  OBSTACLE_BOUNDARY_LAYER,
  OBSTACLE_BOUNDARY_OUTLINE_LAYER,
  OBSTACLE_LABEL_LAYER,
  OBSTACLE_BUFFER_FILL_LAYER,
  OBSTACLE_BUFFER_OUTLINE_LAYER,
  OBSTACLE_BUFFER_SOURCE,
  SURFACE_BUFFER_SOURCE,
  SURFACE_BUFFER_FILL_LAYER,
  SURFACE_BUFFER_OUTLINE_LAYER,
} from "./layers/obstacleLayers";
import {
  addSafetyZoneLayers,
  SAFETY_ZONE_SOURCE,
  SAFETY_ZONE_FILL_LAYER,
  SAFETY_ZONE_HATCH_LAYER,
  SAFETY_ZONE_BORDER_LAYER,
  SAFETY_ZONE_LABEL_LAYER,
} from "./layers/safetyZoneLayers";
import {
  addAglLayers,
  AGL_SOURCE,
  AGL_POINT_LAYER,
  AGL_LABEL_LAYER,
  LHA_SOURCE,
  LHA_POINT_LAYER,
  LHA_LABEL_LAYER,
  EDGE_LIGHTS_LINE_SOURCE,
  EDGE_LIGHTS_LINE_LAYER,
} from "./layers/aglLayers";
import {
  addWaypointLayers as addWaypointLayersFn,
  removeWaypointLayers as removeWaypointLayersFn,
  addSimplifiedTrajectoryLayers,
  removeSimplifiedTrajectoryLayers,
  updateSelectedFilter,
  updateWarningHighlightFilter,
  getSimplifiedTrajectoryLayerIds,
  waypointsToGeoJSON,
  waypointsToLineGeoJSON,
  waypointsToSimplifiedLineGeoJSON,
  waypointsToSimplifiedCornersGeoJSON,
  WAYPOINT_SOURCE,
  WAYPOINT_LINE_SOURCE,
  SIMPLIFIED_LINE_SOURCE,
  SIMPLIFIED_CORNERS_SOURCE,
  WAYPOINT_TRANSIT_CIRCLE_LAYER,
  WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
  WAYPOINT_TAKEOFF_LAYER,
  WAYPOINT_LANDING_LAYER,
  WAYPOINT_HOVER_LAYER,
  WAYPOINT_LINE_LAYER,
  WAYPOINT_LABEL_LAYER,
  WAYPOINT_CAMERA_LINE_LAYER,
  WAYPOINT_ARROW_LAYER,
  WAYPOINT_TRANSIT_HIT_LAYER,
  WAYPOINT_GHOST_TRANSIT_SOURCE,
  WAYPOINT_CAMERA_TARGET_LAYER,
  WAYPOINT_WARNING_HIGHLIGHT_LAYER,
  WAYPOINT_SELECTED_LAYER,
  SIMPLIFIED_TAKEOFF_LAYER,
  SIMPLIFIED_LANDING_LAYER,
} from "./layers/waypointLayers";
import LayerPanel from "./overlays/LayerPanel";
import LegendPanel from "./overlays/LegendPanel";
import PoiInfoPanel from "./overlays/PoiInfoPanel";
import WarningInfoPanel from "./overlays/WarningInfoPanel";
import MapHelpPanel from "./overlays/MapHelpPanel";
import WaypointListPanel from "./overlays/WaypointListPanel";

export interface AirportMapHandle {
  /** get the underlying maplibre-gl map instance. */
  getMap: () => maplibregl.Map | null;
}

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** polls map.isStyleLoaded() until true, then calls callback. returns cancel fn. */
function waitForStyleLoaded(
  map: maplibregl.Map,
  callback: () => void,
): () => void {
  let cancelled = false;
  function check() {
    if (cancelled) return;
    if (map.isStyleLoaded()) {
      callback();
    } else {
      requestAnimationFrame(check);
    }
  }
  requestAnimationFrame(check);
  return () => { cancelled = true; };
}

function makeSatelliteStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      satellite: {
        type: "raster",
        tiles: [ESRI_TILES],
        tileSize: 256,
        maxzoom: 18,
      },
    },
    layers: [{ id: "satellite-base", type: "raster", source: "satellite" }],
  };
}

function makeMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM_TILES],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [{ id: "osm-base", type: "raster", source: "osm" }],
  };
}

// map layer id groups keyed by layer config key
const layerGroupMap: Partial<Record<keyof MapLayerConfig, string[]>> = {
  simplifiedTrajectory: getSimplifiedTrajectoryLayerIds(),
  runways: [
    RUNWAY_FILL_LAYER,
    RUNWAY_STROKE_LAYER,
    RUNWAY_CENTERLINE_LAYER,
    RUNWAY_LABEL_LAYER,
  ],
  taxiways: [TAXIWAY_FILL_LAYER, TAXIWAY_STROKE_LAYER, TAXIWAY_CENTERLINE_LAYER, TAXIWAY_LABEL_LAYER],
  obstacles: [OBSTACLE_ICON_LAYER, OBSTACLE_BOUNDARY_LAYER, OBSTACLE_BOUNDARY_OUTLINE_LAYER, OBSTACLE_LABEL_LAYER],
  bufferZones: [OBSTACLE_BUFFER_FILL_LAYER, OBSTACLE_BUFFER_OUTLINE_LAYER, SURFACE_BUFFER_FILL_LAYER, SURFACE_BUFFER_OUTLINE_LAYER],
  safetyZones: [
    SAFETY_ZONE_FILL_LAYER,
    SAFETY_ZONE_HATCH_LAYER,
    SAFETY_ZONE_BORDER_LAYER,
    SAFETY_ZONE_LABEL_LAYER,
  ],
  aglSystems: [AGL_POINT_LAYER, AGL_LABEL_LAYER, LHA_POINT_LAYER, LHA_LABEL_LAYER, EDGE_LIGHTS_LINE_LAYER],
  transitWaypoints: [WAYPOINT_TRANSIT_CIRCLE_LAYER],
  measurementWaypoints: [WAYPOINT_MEASUREMENT_CIRCLE_LAYER, WAYPOINT_HOVER_LAYER, WAYPOINT_LABEL_LAYER],
  path: [WAYPOINT_LINE_LAYER],
  takeoffLanding: [WAYPOINT_TAKEOFF_LAYER, WAYPOINT_LANDING_LAYER, SIMPLIFIED_TAKEOFF_LAYER, SIMPLIFIED_LANDING_LAYER],
  cameraHeading: [WAYPOINT_CAMERA_LINE_LAYER, WAYPOINT_CAMERA_TARGET_LAYER],
  pathHeading: [WAYPOINT_ARROW_LAYER],
  trajectory: [WAYPOINT_WARNING_HIGHLIGHT_LAYER, WAYPOINT_SELECTED_LAYER],
};

// all interactive layer ids for click handling
const INTERACTIVE_LAYERS = [
  RUNWAY_FILL_LAYER,
  TAXIWAY_FILL_LAYER,
  OBSTACLE_ICON_LAYER,
  OBSTACLE_BOUNDARY_LAYER,
  SAFETY_ZONE_FILL_LAYER,
  AGL_POINT_LAYER,
  LHA_POINT_LAYER,
];

// layers that show cursor pointer on hover
const POINTER_LAYERS = [
  ...INTERACTIVE_LAYERS,
  WAYPOINT_TRANSIT_CIRCLE_LAYER,
  WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
  WAYPOINT_TAKEOFF_LAYER,
  WAYPOINT_LANDING_LAYER,
  WAYPOINT_HOVER_LAYER,
  SIMPLIFIED_TAKEOFF_LAYER,
  SIMPLIFIED_LANDING_LAYER,
];

// cursor styles per active tool
const TOOL_CURSORS: Record<string, string> = {
  [MapTool.SELECT]: "default",
  [MapTool.PAN]: "grab",
  [MapTool.MOVE_WAYPOINT]: TOOL_CURSOR_MOVE,
  [MapTool.MEASURE]: TOOL_CURSOR_MEASURE,
  [MapTool.HEADING]: TOOL_CURSOR_HEADING,
  [MapTool.ZOOM]: "zoom-in",
  [MapTool.PLACE_TAKEOFF]: "crosshair",
  [MapTool.PLACE_LANDING]: "crosshair",
};

const PENDING_PREVIEW_SOURCE = "pending-preview";
const PENDING_PREVIEW_FILL_LAYER = "pending-preview-fill";
const PENDING_PREVIEW_BORDER_LAYER = "pending-preview-border";
const PENDING_PREVIEW_POINT_LAYER = "pending-preview-point";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** fly the map to the center of a feature. */
function flyToFeature(map: maplibregl.Map, feature: MapFeature) {
  let lon: number | undefined;
  let lat: number | undefined;
  let minZoom = 15.5;

  if (feature.type === "waypoint") {
    const coords = feature.data.position?.coordinates;
    if (coords) { [lon, lat] = coords; }
    minZoom = 17;
  } else if (feature.type === "obstacle") {
    const ring = feature.data.boundary?.coordinates?.[0];
    if (ring && ring.length > 0) {
      lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
    }
  } else if (feature.type === "agl") {
    [lon, lat] = feature.data.position.coordinates;
  } else if (feature.type === "lha") {
    [lon, lat] = feature.data.position.coordinates;
    minZoom = 18;
  } else if (feature.type === "surface") {
    const coords = feature.data.geometry.coordinates;
    if (coords.length > 0) {
      lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
      lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    }
  }

  if (lon !== undefined && lat !== undefined) {
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), minZoom), duration: 800 });
  }
}

const AirportMap = forwardRef<AirportMapHandle, AirportMapProps & {
  activeTool?: MapTool;
  pendingGeometry?: GeoJSON.Polygon | null;
  pendingPointPosition?: [number, number] | null;
}>(function AirportMap({
  airport,
  layers: layersProp,
  interactive = true,
  showLayerPanel = true,
  showLegend = true,
  showPoiInfo = true,
  showWaypointList = true,
  simplifiedTrajectory = false,
  onFeatureClick,
  children,
  waypoints,
  selectedWaypointId,
  onWaypointClick,
  terrainMode: terrainModeProp,
  onTerrainChange: onTerrainChangeProp,
  missionStatus,
  onMapClick,
  takeoffCoordinate,
  landingCoordinate,
  inspectionIndexMap,
  visibleInspectionIds,
  onLayerChange,
  leftPanelChildren,
  activeTool,
  onPlaceTakeoff,
  onPlaceLanding,
  measureData,
  onMeasureClear,
  onMeasureFinish,
  onMeasureMouseMove,
  isMeasureDrawing,
  headingData,
  onHeadingClear,
  headingOrigin,
  isHeadingDrawing,
  onWaypointDrag,
  onTransitInsert,
  onTransitDelete,
  onInfraPointDrag,
  zoomPercent,
  onZoomChange,
  focusFeature,
  showZoomControls = true,
  showCompass = true,
  showHelpPanel = true,
  helpVariant = "full",
  is3D: is3DProp,
  onBearingChange,
  bearingResetKey,
  highlightedWaypointIds,
  highlightSeverity,
  selectedWarning,
  onWarningClose,
  pendingGeometry,
  pendingPointPosition,
}, ref) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersAddedRef = useRef(false);
  const cancelStylePollRef = useRef<(() => void) | null>(null);
  const suppressZoomEndRef = useRef(false);
  const waypointsRef = useRef(waypoints);
  const takeoffRef = useRef(takeoffCoordinate);
  takeoffRef.current = takeoffCoordinate;
  const landingRef = useRef(landingCoordinate);
  landingRef.current = landingCoordinate;
  const indexMapRef = useRef(inspectionIndexMap);
  indexMapRef.current = inspectionIndexMap;
  const highlightedIdsRef = useRef(highlightedWaypointIds);
  highlightedIdsRef.current = highlightedWaypointIds;
  const highlightSeverityRef = useRef(highlightSeverity);
  highlightSeverityRef.current = highlightSeverity;

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }), []);

  const [layerConfig, setLayerConfig] = useState<MapLayerConfig>({
    ...DEFAULT_LAYER_CONFIG,
    simplifiedTrajectory,
    ...layersProp,
  });
  const layerConfigRef = useRef(layerConfig);
  layerConfigRef.current = layerConfig;

  useEffect(() => {
    onLayerChange?.(layerConfig);
  }, [layerConfig, onLayerChange]);
  const visibleInspectionIdsRef = useRef(visibleInspectionIds);
  visibleInspectionIdsRef.current = visibleInspectionIds;
  const [internalTerrainMode, setInternalTerrainMode] = useState<"map" | "satellite">(
    "satellite",
  );
  const terrainMode = terrainModeProp ?? internalTerrainMode;
  const setTerrainMode = onTerrainChangeProp ?? setInternalTerrainMode;
  const appliedTerrainRef = useRef(terrainMode);

  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(
    null,
  );

  const [bearing, setBearing] = useState(0);
  const [internalIs3D] = useState(false);
  const is3D = is3DProp ?? internalIs3D;

  // cesium 3d viewer state
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const cesiumViewerRef = useRef<import("cesium").Viewer | null>(null);
  const { syncToCesium, syncToMaplibre } = useCesiumSync(mapRef);
  // fly-along state placeholder - wired from parent via props
  // const [flyAlongState] = useState<FlyAlongState>({ status: "idle", currentIndex: 0, speed: 2, progress: 0 });

  const prevIs3DRef = useRef(is3D);

  // load cesium on first 3d toggle, sync cameras on switch
  useEffect(() => {
    if (is3D && !cesiumLoaded) {
      setCesiumLoaded(true);
    }
    if (is3D && cesiumViewerRef.current) {
      syncToCesium(cesiumViewerRef.current);
    }
    if (!is3D && prevIs3DRef.current && cesiumViewerRef.current) {
      syncToMaplibre(cesiumViewerRef.current);
    }
    prevIs3DRef.current = is3D;
  }, [is3D, cesiumLoaded, syncToCesium, syncToMaplibre]);

  // track map bearing for compass
  const onBearingChangeRef = useRef(onBearingChange);
  onBearingChangeRef.current = onBearingChange;

  // handle waypoint selection from the internal WaypointListPanel
  const handleWaypointListSelect = useCallback(
    (wpId: string | null) => {
      onWaypointClick?.(wpId);
      if (!wpId) {
        setSelectedFeature(null);
        return;
      }

      // standalone takeoff/landing
      if (wpId === "takeoff" && takeoffCoordinate) {
        const [lon, lat, alt] = takeoffCoordinate.coordinates;
        setSelectedFeature({
          type: "waypoint",
          data: {
            id: "takeoff",
            waypoint_type: "TAKEOFF",
            sequence_order: 0,
            position: { type: "Point", coordinates: [lon, lat, alt] },
            stack_count: 1,
          },
        });
        return;
      }
      if (wpId === "landing" && landingCoordinate) {
        const [lon, lat, alt] = landingCoordinate.coordinates;
        setSelectedFeature({
          type: "waypoint",
          data: {
            id: "landing",
            waypoint_type: "LANDING",
            sequence_order: 0,
            position: { type: "Point", coordinates: [lon, lat, alt] },
            stack_count: 1,
          },
        });
        return;
      }

      const wp = waypoints?.find((w) => w.id === wpId);
      if (wp) {
        const [lon, lat, alt] = wp.position.coordinates;
        setSelectedFeature({
          type: "waypoint",
          data: {
            id: wp.id,
            waypoint_type: wp.waypoint_type,
            sequence_order: wp.sequence_order,
            position: { type: "Point", coordinates: [lon, lat, alt] },
            stack_count: 1,
            heading: wp.heading ?? null,
            speed: wp.speed ?? null,
            camera_action: wp.camera_action ?? null,
            camera_target: wp.camera_target ?? null,
            gimbal_pitch: wp.gimbal_pitch ?? null,
            hover_duration: wp.hover_duration ?? null,
          },
        });
      }
    },
    [onWaypointClick, waypoints, takeoffCoordinate, landingCoordinate],
  );

  // apply 3D pitch toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: is3D ? 60 : 0, duration: 400 });
  }, [is3D]);

  // fly to focused feature and highlight it on the map
  // track whether a focusFeature change originated from a map click (skip flyTo)
  // vs an external trigger like a list panel click (do flyTo)
  const skipFlyRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // sync highlight even when clearing selection
    syncHighlight(map, focusFeature ?? null);

    if (!focusFeature) return;

    // skip flyTo when the focus change came from a map single-click
    if (skipFlyRef.current) {
      skipFlyRef.current = false;
      return;
    }

    flyToFeature(map, focusFeature);
  }, [focusFeature]);

  // sync pending creation preview geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(PENDING_PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];
    if (pendingGeometry) {
      features.push({ type: "Feature", properties: {}, geometry: pendingGeometry });
    }
    if (pendingPointPosition) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: pendingPointPosition },
      });
    }
    src.setData({ type: "FeatureCollection", features });
  }, [pendingGeometry, pendingPointPosition]);

  // apply cursor based on active tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cursor = TOOL_CURSORS[activeTool ?? MapTool.SELECT] ?? "";
    map.getCanvas().style.cursor = cursor;
  }, [activeTool]);

  // enable/disable dragPan based on active tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool === MapTool.MOVE_WAYPOINT) {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
    }
    return () => {
      if (map.dragPan) map.dragPan.enable();
    };
  }, [activeTool, interactive]);

  // measure tool: contextmenu to finish/clear, mousemove for cursor line, esc to clear
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.MEASURE) return;

    function handleContextMenu(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      if (isMeasureDrawing) {
        onMeasureFinish?.();
      } else {
        onMeasureClear?.();
      }
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (isMeasureDrawing) {
        onMeasureMouseMove?.(e.lngLat.lng, e.lngLat.lat);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onMeasureClear?.();
      }
    }

    map.on("contextmenu", handleContextMenu);
    map.on("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool, isMeasureDrawing, onMeasureClear, onMeasureFinish, onMeasureMouseMove]);

  // refs for tool clear callbacks (used in terrain change without adding to deps)
  const onMeasureClearRef = useRef(onMeasureClear);
  onMeasureClearRef.current = onMeasureClear;
  const onHeadingClearRef = useRef(onHeadingClear);
  onHeadingClearRef.current = onHeadingClear;

  // heading tool: right-click/esc to clear, mousemove updates sources directly (no react state)
  const headingOriginRef = useRef(headingOrigin);
  headingOriginRef.current = headingOrigin;
  const isHeadingDrawingRef = useRef(isHeadingDrawing);
  isHeadingDrawingRef.current = isHeadingDrawing;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.HEADING) return;

    function handleContextMenu(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      onHeadingClear?.();
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      const origin = headingOriginRef.current;
      if (!isHeadingDrawingRef.current || !origin) return;

      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const bearing = Math.round(computeBearingFn(origin[0], origin[1], cursor[0], cursor[1]) * 100) / 100;

      // update sources directly - no react re-render
      if (!map!.getSource("heading-point")) return;

      const pointSrc = map!.getSource("heading-point") as maplibregl.GeoJSONSource | undefined;
      if (pointSrc) pointSrc.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { kind: "origin" }, geometry: { type: "Point", coordinates: origin } },
          { type: "Feature", properties: { kind: "endpoint", bearing: bearing - 90 }, geometry: { type: "Point", coordinates: cursor } },
        ],
      });

      const lineSrc = map!.getSource("heading-line") as maplibregl.GeoJSONSource | undefined;
      if (lineSrc) lineSrc.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [origin, cursor] } }],
      });

      const labelSrc = map!.getSource("heading-label") as maplibregl.GeoJSONSource | undefined;
      const midLng = (origin[0] + cursor[0]) / 2;
      const midLat = (origin[1] + cursor[1]) / 2;
      if (labelSrc) labelSrc.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { label: `${bearing.toFixed(2)}°` }, geometry: { type: "Point", coordinates: [midLng, midLat] } }],
      });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onHeadingClear?.();
      }
    }

    map.on("contextmenu", handleContextMenu);
    map.on("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool, onHeadingClear]);

  // move waypoint tool: drag behavior with live preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.MOVE_WAYPOINT) return;

    const dragState = { waypointId: "", originalAlt: 0, dragging: false };
    let rafId = 0;

    const waypointQueryLayers = [
      WAYPOINT_TRANSIT_CIRCLE_LAYER,
      WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
      WAYPOINT_TAKEOFF_LAYER,
      WAYPOINT_LANDING_LAYER,
      WAYPOINT_HOVER_LAYER,
    ];

    function handleMouseDown(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const layers = waypointQueryLayers.filter((id) => {
        try { return map.getLayer(id); } catch { return false; }
      });
      if (!layers.length) return;
      const features = map.queryRenderedFeatures(e.point, { layers });
      if (!features.length) return;
      const wpId = String(features[0].properties?.id ?? "");
      if (!wpId) return;
      const coords = features[0].geometry && "coordinates" in features[0].geometry
        ? (features[0].geometry as GeoJSON.Point).coordinates
        : [0, 0, 0];
      dragState.waypointId = wpId;
      dragState.originalAlt = coords[2] ?? 0;
      dragState.dragging = true;
      map.getCanvas().style.cursor = "grabbing";
      map.dragPan.disable();
      e.preventDefault();
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!dragState.dragging || !map) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!map) return;
        const wps = waypointsRef.current ?? [];
        const newCoords: [number, number, number] = [e.lngLat.lng, e.lngLat.lat, dragState.originalAlt];
        const updated: WaypointResponse[] = wps.map((wp) => {
          if (wp.id !== dragState.waypointId) return wp;
          return {
            ...wp,
            position: {
              ...wp.position,
              coordinates: newCoords,
            },
          };
        });

        // update point source
        const pointSrc = map.getSource(WAYPOINT_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (pointSrc) {
          pointSrc.setData(
            waypointsToGeoJSON(updated, takeoffRef.current, landingRef.current, indexMapRef.current),
          );
        }

        // update line source
        const lineSrc = map.getSource(WAYPOINT_LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (lineSrc) {
          lineSrc.setData(waypointsToLineGeoJSON(updated));
        }

        // update simplified trajectory sources
        const simpLineSrc = map.getSource(SIMPLIFIED_LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (simpLineSrc) {
          simpLineSrc.setData(waypointsToSimplifiedLineGeoJSON(updated));
        }
        const simpCornerSrc = map.getSource(SIMPLIFIED_CORNERS_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (simpCornerSrc) {
          simpCornerSrc.setData(waypointsToSimplifiedCornersGeoJSON(updated));
        }
      });
    }

    function handleMouseUp(e: maplibregl.MapMouseEvent) {
      if (!dragState.dragging || !map) return;
      cancelAnimationFrame(rafId);
      dragState.dragging = false;
      map.getCanvas().style.cursor = TOOL_CURSORS[MapTool.MOVE_WAYPOINT] || "crosshair";
      map.dragPan.enable();
      onWaypointDrag?.(
        dragState.waypointId,
        [e.lngLat.lng, e.lngLat.lat, dragState.originalAlt],
      );
      dragState.waypointId = "";
    }

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    return () => {
      cancelAnimationFrame(rafId);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [activeTool, interactive, onWaypointDrag]);

  // transit insert/delete refs
  const onTransitInsertRef = useRef(onTransitInsert);
  onTransitInsertRef.current = onTransitInsert;
  const onTransitDeleteRef = useRef(onTransitDelete);
  onTransitDeleteRef.current = onTransitDelete;

  // zoom tool: click to zoom in/out, sync zoomPercent
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.ZOOM) return;

    function handleZoomClick() {
      if (!map) return;
      map.zoomTo(map.getZoom() + 1, { duration: 300 });
    }

    function handleZoomContext(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      if (!map) return;
      map.zoomTo(map.getZoom() - 1, { duration: 300 });
    }

    map.on("click", handleZoomClick);
    map.on("contextmenu", handleZoomContext);
    return () => {
      map.off("click", handleZoomClick);
      map.off("contextmenu", handleZoomContext);
    };
  }, [activeTool, interactive]);

  // sync zoomPercent from parent to map zoom level
  useEffect(() => {
    const map = mapRef.current;
    if (!map || zoomPercent === undefined) return;
    const targetZoom = 14.5 * (zoomPercent / 100);
    if (Math.abs(map.getZoom() - targetZoom) > 0.1) {
      suppressZoomEndRef.current = true;
      map.zoomTo(targetZoom, { duration: 300 });
    }
  }, [zoomPercent]);

  // report map zoom changes back to parent
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  // initialize map - no navigation control (removed old zoom/compass)
  useEffect(() => {
    if (!containerRef.current) return;

    const [lon, lat] = airport.location.coordinates;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeSatelliteStyle(),
      center: [lon, lat],
      zoom: 14.5,
      interactive,
      attributionControl: false,
    });

    mapRef.current = map;

    // track bearing for compass
    function handleRotate() {
      const b = map.getBearing();
      setBearing(b);
      onBearingChangeRef.current?.(b);
    }
    map.on("rotate", handleRotate);

    // report zoom changes back to parent
    function handleZoom() {
      if (suppressZoomEndRef.current) return;
      const currentZoom = map.getZoom();
      const percent = Math.round((currentZoom / 14.5) * 100);
      onZoomChangeRef.current?.(percent);
    }
    function handleZoomEnd() {
      suppressZoomEndRef.current = false;
    }
    map.on("zoom", handleZoom);
    map.on("zoomend", handleZoomEnd);

    return () => {
      map.off("rotate", handleRotate);
      map.off("zoom", handleZoom);
      map.off("zoomend", handleZoomEnd);
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, [airport.id, interactive]);

  // reset bearing when bearingResetKey changes
  useEffect(() => {
    if (bearingResetKey === undefined || bearingResetKey === 0) return;
    const map = mapRef.current;
    if (map) map.easeTo({ bearing: 0, duration: 400 });
  }, [bearingResetKey]);

  // add measure tool sources and layers to the map
  function addMeasureLayersToMap(map: maplibregl.Map) {
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!map.getSource("measure-points")) {
      map.addSource("measure-points", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "measure-points-layer",
        type: "circle",
        source: "measure-points",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ff6b00",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    if (!map.getSource("measure-lines")) {
      map.addSource("measure-lines", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "measure-lines-layer",
        type: "line",
        source: "measure-lines",
        paint: {
          "line-color": "#ff6b00",
          "line-width": 2,
          "line-dasharray": [4, 3],
        },
      });
    }

    if (!map.getSource("measure-labels")) {
      map.addSource("measure-labels", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "measure-labels-layer",
        type: "symbol",
        source: "measure-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-offset": [0, -1.2],
          "text-anchor": "bottom",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ff6b00",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });
    }
  }

  // add heading tool sources and layers to the map
  function addHeadingLayersToMap(map: maplibregl.Map) {
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!map.getSource("heading-point")) {
      map.addSource("heading-point", { type: "geojson", data: emptyFC });

      // origin circle
      map.addLayer({
        id: "heading-point-layer",
        type: "circle",
        source: "heading-point",
        filter: ["==", ["get", "kind"], "origin"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#4595e5",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // arrowhead at endpoint - bearing property is already offset by -90
      map.addLayer({
        id: "heading-arrow-layer",
        type: "symbol",
        source: "heading-point",
        filter: ["==", ["get", "kind"], "endpoint"],
        layout: {
          "text-field": "▶",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 16,
          "text-rotate": ["get", "bearing"],
          "text-rotation-alignment": "map",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#4595e5",
        },
      });
    }

    if (!map.getSource("heading-line")) {
      map.addSource("heading-line", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "heading-line-layer",
        type: "line",
        source: "heading-line",
        paint: {
          "line-color": "#4595e5",
          "line-width": 2,
        },
      });
    }

    if (!map.getSource("heading-label")) {
      map.addSource("heading-label", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "heading-label-layer",
        type: "symbol",
        source: "heading-label",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-offset": [0, -1.2],
          "text-anchor": "bottom",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#4595e5",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });
    }
  }

  // highlight layer ids for selected infrastructure features
  const HIGHLIGHT_RUNWAY = "highlight-runway";
  const HIGHLIGHT_TAXIWAY = "highlight-taxiway";
  const HIGHLIGHT_OBSTACLE = "highlight-obstacle";
  const HIGHLIGHT_SAFETY_ZONE = "highlight-safety-zone";
  const HIGHLIGHT_AGL = "highlight-agl";
  const HIGHLIGHT_LHA = "highlight-lha";

  function addHighlightLayers(map: maplibregl.Map) {
    /** add selection highlight layers for all infrastructure types. */
    const emptyFilter: maplibregl.ExpressionSpecification = ["==", ["get", "id"], ""];

    // runway polygon outline
    if (map.getSource(RUNWAY_POLYGON_SOURCE) && !map.getLayer(HIGHLIGHT_RUNWAY)) {
      map.addLayer({
        id: HIGHLIGHT_RUNWAY,
        type: "line",
        source: RUNWAY_POLYGON_SOURCE,
        filter: emptyFilter,
        paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 0.9 },
      });
    }

    // taxiway polygon outline
    if (map.getSource(TAXIWAY_POLYGON_SOURCE) && !map.getLayer(HIGHLIGHT_TAXIWAY)) {
      map.addLayer({
        id: HIGHLIGHT_TAXIWAY,
        type: "line",
        source: TAXIWAY_POLYGON_SOURCE,
        filter: emptyFilter,
        paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 0.9 },
      });
    }

    // obstacle point ring
    if (map.getSource(OBSTACLE_SOURCE) && !map.getLayer(HIGHLIGHT_OBSTACLE)) {
      map.addLayer({
        id: HIGHLIGHT_OBSTACLE,
        type: "circle",
        source: OBSTACLE_SOURCE,
        filter: emptyFilter,
        paint: {
          "circle-radius": 16,
          "circle-color": "transparent",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });
    }

    // safety zone polygon outline
    if (map.getSource(SAFETY_ZONE_SOURCE) && !map.getLayer(HIGHLIGHT_SAFETY_ZONE)) {
      map.addLayer({
        id: HIGHLIGHT_SAFETY_ZONE,
        type: "line",
        source: SAFETY_ZONE_SOURCE,
        filter: emptyFilter,
        paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 0.9 },
      });
    }

    // agl point ring
    if (map.getSource(AGL_SOURCE) && !map.getLayer(HIGHLIGHT_AGL)) {
      map.addLayer({
        id: HIGHLIGHT_AGL,
        type: "circle",
        source: AGL_SOURCE,
        filter: emptyFilter,
        paint: {
          "circle-radius": 16,
          "circle-color": "transparent",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });
    }

    // lha point ring
    if (map.getSource(LHA_SOURCE) && !map.getLayer(HIGHLIGHT_LHA)) {
      map.addLayer({
        id: HIGHLIGHT_LHA,
        type: "circle",
        source: LHA_SOURCE,
        filter: emptyFilter,
        paint: {
          "circle-radius": 12,
          "circle-color": "transparent",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });
    }
  }

  function syncHighlight(map: maplibregl.Map, feature: MapFeature | null) {
    /** update highlight layer filters to match selected feature. */
    const layers = [
      { id: HIGHLIGHT_RUNWAY, type: "surface", subType: "RUNWAY" },
      { id: HIGHLIGHT_TAXIWAY, type: "surface", subType: "TAXIWAY" },
      { id: HIGHLIGHT_OBSTACLE, type: "obstacle" },
      { id: HIGHLIGHT_SAFETY_ZONE, type: "safety_zone" },
      { id: HIGHLIGHT_AGL, type: "agl" },
      { id: HIGHLIGHT_LHA, type: "lha" },
    ];

    for (const layer of layers) {
      try {
        if (!map.getLayer(layer.id)) continue;
        let matchId = "";
        if (feature && feature.type === layer.type) {
          if (layer.subType) {
            // surface: match only if sub-type matches
            if (feature.type === "surface" && feature.data.surface_type === layer.subType) {
              matchId = feature.data.id;
            }
          } else {
            matchId = feature.data.id;
          }
        }
        map.setFilter(layer.id, ["==", ["get", "id"], matchId]);
      } catch {
        // layer may not exist
      }
    }
  }

  function addPendingPreviewLayers(map: maplibregl.Map) {
    /** add source and layers for pending creation preview. */
    if (map.getSource(PENDING_PREVIEW_SOURCE)) return;
    map.addSource(PENDING_PREVIEW_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: PENDING_PREVIEW_FILL_LAYER,
      type: "fill",
      source: PENDING_PREVIEW_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#ff6b00", "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: PENDING_PREVIEW_BORDER_LAYER,
      type: "line",
      source: PENDING_PREVIEW_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "line-color": "#ff6b00", "line-width": 2, "line-dasharray": [4, 3] },
    });
    map.addLayer({
      id: PENDING_PREVIEW_POINT_LAYER,
      type: "circle",
      source: PENDING_PREVIEW_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#ff6b00",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  // shared helper to add all infrastructure layers
  // infrastructure source/layer names for cleanup
  const INFRA_SOURCES = [
    SAFETY_ZONE_SOURCE, RUNWAY_SOURCE, RUNWAY_POLYGON_SOURCE,
    TAXIWAY_SOURCE, TAXIWAY_POLYGON_SOURCE, OBSTACLE_SOURCE,
    OBSTACLE_BOUNDARY_SOURCE, OBSTACLE_BUFFER_SOURCE, SURFACE_BUFFER_SOURCE,
    AGL_SOURCE, LHA_SOURCE,
    // edge-light connector line + runway touchpoints - conditionally added by their
    // layer modules, but still must be torn down so the next addSource() doesn't collide
    EDGE_LIGHTS_LINE_SOURCE, TOUCHPOINT_SOURCE,
  ];

  function removeInfraLayers(map: maplibregl.Map) {
    /** remove infrastructure layers and sources so they can be re-added with fresh data. */
    const style = map.getStyle();
    if (!style?.layers) return;
    // remove layers that reference infra sources
    for (const layer of [...style.layers]) {
      if (INFRA_SOURCES.includes((layer as { source?: string }).source ?? "")) {
        try { map.removeLayer(layer.id); } catch { /* noop */ }
      }
    }
    // remove highlight layers too
    for (const lyr of [HIGHLIGHT_RUNWAY, HIGHLIGHT_TAXIWAY, HIGHLIGHT_OBSTACLE, HIGHLIGHT_SAFETY_ZONE, HIGHLIGHT_AGL, HIGHLIGHT_LHA]) {
      try { if (map.getLayer(lyr)) map.removeLayer(lyr); } catch { /* noop */ }
    }
    // remove sources
    for (const src of INFRA_SOURCES) {
      try { if (map.getSource(src)) map.removeSource(src); } catch { /* noop */ }
    }
  }

  const addAllLayers = useCallback(
    (map: maplibregl.Map) => {
      if (layersAddedRef.current) return;
      registerAllMapImages(map);
      addSafetyZoneLayers(map, airport.safety_zones);
      addSurfaceLayers(map, airport.surfaces);
      addObstacleLayers(map, airport.obstacles);
      addBufferZoneLayers(map, airport.obstacles, airport.surfaces);
      addAglLayers(map, airport.surfaces);
      addMeasureLayersToMap(map);
      addHeadingLayersToMap(map);
      addHighlightLayers(map);
      addPendingPreviewLayers(map);
      layersAddedRef.current = true;

      // sync layer visibility immediately so newly-added layers honor the
      // current LayerPanel toggle state instead of defaulting to "visible"
      const cfg = layerConfigRef.current;
      for (const [key, layerIds] of Object.entries(layerGroupMap)) {
        const visible = cfg[key as keyof MapLayerConfig];
        if (visible === undefined) continue;
        for (const layerId of layerIds) {
          try {
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
            }
          } catch {
            // layer may not exist
          }
        }
      }
    },
    [airport],
  );

  // add infrastructure layers once map + airport data are ready, refresh on airport change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      if (!map) return;
      // if layers already exist, remove and re-add with fresh airport data
      if (layersAddedRef.current) {
        removeInfraLayers(map);
        layersAddedRef.current = false;
      }
      addAllLayers(map);

      // remove + re-add waypoint layers so they render on top of infrastructure
      removeWaypointLayersFn(map);
      removeSimplifiedTrajectoryLayers(map);
      registerAllMapImages(map);
      addWaypointLayersFn(map, waypointsRef.current ?? [], takeoffRef.current, landingRef.current, undefined, indexMapRef.current);
      addSimplifiedTrajectoryLayers(map, waypointsRef.current ?? [], takeoffRef.current, landingRef.current);

      // restore layer toggle visibility after rebuild
      const cfg = layerConfigRef.current;
      for (const [key, layerIds] of Object.entries(layerGroupMap)) {
        const visible = cfg[key as keyof MapLayerConfig];
        if (visible === undefined) continue;
        for (const layerId of layerIds) {
          try {
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
            }
          } catch {
            // layer may not exist
          }
        }
      }

      // keep vertex editor overlay on top of rebuilt infra layers
      for (const lyr of ["vertex-edit-corners", "vertex-edit-center"]) {
        if (map.getLayer(lyr)) map.moveLayer(lyr);
      }
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      // poll until style is ready - "load" event only fires once and may have already fired
      let cancelled = false;
      function poll() {
        if (cancelled) return;
        if (map!.isStyleLoaded()) {
          addLayers();
        } else {
          requestAnimationFrame(poll);
        }
      }
      requestAnimationFrame(poll);
      return () => { cancelled = true; };
    }
  }, [airport, addAllLayers]);

  // apply inspection visibility filters to waypoint layers
  const syncInspectionFilters = useCallback((map: maplibregl.Map) => {
    /** apply inspection_id filters to waypoint layers. */
    const inspIds = visibleInspectionIdsRef.current;
    if (!inspIds) return;

    const ids = [...inspIds];
    const visFilter: maplibregl.ExpressionSpecification = [
      "any",
      ["!", ["has", "inspection_id"]],
      ["!", ["to-boolean", ["get", "inspection_id"]]],
      ["in", ["get", "inspection_id"], ["literal", ids]],
    ];

    const layersToFilter = [
      { id: WAYPOINT_TRANSIT_CIRCLE_LAYER, base: ["==", ["get", "waypoint_type"], "TRANSIT"] as maplibregl.ExpressionSpecification },
      { id: WAYPOINT_MEASUREMENT_CIRCLE_LAYER, base: ["==", ["get", "waypoint_type"], "MEASUREMENT"] as maplibregl.ExpressionSpecification },
      { id: WAYPOINT_HOVER_LAYER, base: ["==", ["get", "waypoint_type"], "HOVER"] as maplibregl.ExpressionSpecification },
      { id: WAYPOINT_LABEL_LAYER, base: ["==", ["get", "waypoint_type"], "MEASUREMENT"] as maplibregl.ExpressionSpecification },
      { id: WAYPOINT_LINE_LAYER, base: null },
      { id: WAYPOINT_ARROW_LAYER, base: null },
      { id: WAYPOINT_CAMERA_LINE_LAYER, base: null },
    ];

    for (const { id, base } of layersToFilter) {
      try {
        if (map.getLayer(id)) {
          const filter = base
            ? (["all", base, visFilter] as maplibregl.ExpressionSpecification)
            : visFilter;
          map.setFilter(id, filter);
        }
      } catch {
        // layer may not exist
      }
    }
  }, []);

  // apply current layer config visibility to all map layers
  const syncLayerVisibility = useCallback((map: maplibregl.Map) => {
    /** sync layer toggle state to maplibre visibility properties. */
    const cfg = layerConfigRef.current;
    for (const [key, layerIds] of Object.entries(layerGroupMap)) {
      const visible = cfg[key as keyof MapLayerConfig];
      if (visible === undefined) continue;
      for (const layerId of layerIds) {
        try {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
          }
        } catch {
          // layer may not exist
        }
      }
    }
  }, []);

  // add or update waypoint layers
  const addWaypointLayers = useCallback((
    map: maplibregl.Map,
    wpsOverride?: WaypointResponse[],
    tkOverride?: PointZ | null,
    ldOverride?: PointZ | null,
  ) => {
    const wps = wpsOverride ?? waypointsRef.current;
    // keep ref in sync so other code paths see the same data
    waypointsRef.current = wps;
    const takeoff = tkOverride !== undefined ? tkOverride : takeoffRef.current;
    const landing = ldOverride !== undefined ? ldOverride : landingRef.current;
    const idxMap = indexMapRef.current;

    registerAllMapImages(map);
    addWaypointLayersFn(map, wps ?? [], takeoff, landing, selectedWaypointId, idxMap);
    addSimplifiedTrajectoryLayers(map, wps ?? [], takeoff, landing);

    // re-sync visibility and filters after layers are added
    syncLayerVisibility(map);
    syncInspectionFilters(map);

    // re-apply warning highlight state after layer rebuild
    updateWarningHighlightFilter(
      map,
      highlightedIdsRef.current,
      highlightSeverityRef.current,
      layerConfigRef.current.simplifiedTrajectory,
    );

    // force maplibre to render the updated source data on the next frame
    // - GeoJSONSource.setData is queued internally and may not redraw until
    //   the next user interaction; triggerRepaint guarantees immediate paint
    //   so newly-inserted transit waypoints appear without an extra click.
    map.triggerRepaint();
  }, [selectedWaypointId, syncLayerVisibility, syncInspectionFilters]);

  // sync waypoints ref and re-render layers when waypoints or coords change
  useEffect(() => {
    waypointsRef.current = waypoints;
    const map = mapRef.current;
    if (!map) return;

    const apply = () => addWaypointLayers(map, waypoints ?? undefined, takeoffCoordinate, landingCoordinate);

    if (map.isStyleLoaded()) {
      apply();
      map.triggerRepaint();
    } else {
      // style may not be loaded yet after mount - fire once then detach from both events
      const handler = () => {
        map.off("load", handler);
        map.off("styledata", handler);
        apply();
      };
      map.on("load", handler);
      map.on("styledata", handler);
      return () => { map.off("load", handler); map.off("styledata", handler); };
    }
  }, [waypoints, takeoffCoordinate, landingCoordinate, inspectionIndexMap, addWaypointLayers]);

  // update selected waypoint highlight and feature info
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateSelectedFilter(map, selectedWaypointId);

    // sync feature info when selection changes (e.g. from waypoint list click)
    if (!selectedWaypointId) return;
    const wps = waypointsRef.current ?? [];
    const wp = wps.find((w) => w.id === selectedWaypointId);
    if (wp) {
      setSelectedFeature({
        type: "waypoint",
        data: {
          id: wp.id,
          waypoint_type: wp.waypoint_type,
          sequence_order: wp.sequence_order,
          position: wp.position,
          stack_count: 1,
          heading: wp.heading ?? null,
          speed: wp.speed ?? null,
          camera_action: wp.camera_action ?? null,
          camera_target: wp.camera_target ?? null,
          gimbal_pitch: wp.gimbal_pitch ?? null,
        },
      });
    }
  }, [selectedWaypointId]);

  // update warning highlight layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateWarningHighlightFilter(map, highlightedWaypointIds, highlightSeverity, layerConfig.simplifiedTrajectory);

    // fly to highlighted waypoints
    if (!highlightedWaypointIds || highlightedWaypointIds.length === 0) return;
    const wps = waypointsRef.current ?? [];
    const highlighted = wps.filter((w) => highlightedWaypointIds.includes(w.id));
    if (highlighted.length === 0) return;

    if (highlighted.length === 1) {
      const [lon, lat] = highlighted[0].position.coordinates;
      map.flyTo({ center: [lon, lat], zoom: 17, duration: 800 });
    } else {
      const lngs = highlighted.map((w) => w.position.coordinates[0]);
      const lats = highlighted.map((w) => w.position.coordinates[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 100, duration: 800 },
      );
    }
  }, [highlightedWaypointIds, highlightSeverity, layerConfig.simplifiedTrajectory]);

  // cursor and hover effects - only for SELECT tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    function handleMouseEnter() {
      const tool = activeTool ?? MapTool.SELECT;
      if (tool === MapTool.SELECT && map) {
        map.getCanvas().style.cursor = "pointer";
      }
    }
    function handleMouseLeave() {
      const tool = activeTool ?? MapTool.SELECT;
      if (map) {
        map.getCanvas().style.cursor = TOOL_CURSORS[tool] ?? "";
      }
    }

    function bindCursor() {
      if (!map) return;
      for (const layerId of POINTER_LAYERS) {
        try {
          if (map.getLayer(layerId)) {
            map.on("mouseenter", layerId, handleMouseEnter);
            map.on("mouseleave", layerId, handleMouseLeave);
          }
        } catch {
          // layer may not exist
        }
      }
    }

    if (map.isStyleLoaded()) {
      bindCursor();
    } else {
      map.on("load", bindCursor);
    }

    return () => {
      for (const layerId of POINTER_LAYERS) {
        try {
          map.off("mouseenter", layerId, handleMouseEnter);
          map.off("mouseleave", layerId, handleMouseLeave);
        } catch {
          // cleanup
        }
      }
      map.off("load", bindCursor);
    };
  }, [interactive, activeTool]);

  // drag agl/lha points in select mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive || !onInfraPointDrag) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.SELECT) return;

    const dragState = {
      featureId: "", featureType: "" as "agl" | "lha", originalAlt: 0, dragging: false,
      snapshot: null as GeoJSON.Feature[] | null,
    };
    let rafId = 0;

    const infraQueryLayers = [AGL_POINT_LAYER, LHA_POINT_LAYER];

    function snapshotSource(sourceName: string): GeoJSON.Feature[] {
      /** deduplicated snapshot of source features - querySourceFeatures can return tile-boundary dupes. */
      const raw = map!.querySourceFeatures(sourceName);
      const seen = new Set<string>();
      const out: GeoJSON.Feature[] = [];
      for (const f of raw) {
        const id = String(f.properties?.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ type: "Feature", properties: f.properties, geometry: f.geometry });
      }
      return out;
    }

    function handleMouseDown(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const layers = infraQueryLayers.filter((id) => {
        try { return map.getLayer(id); } catch { return false; }
      });
      if (!layers.length) return;
      const features = map.queryRenderedFeatures(e.point, { layers });
      if (!features.length) return;
      const fId = String(features[0].properties?.id ?? "");
      if (!fId) return;
      const entityType = String(features[0].properties?.entityType ?? "") as "agl" | "lha";
      if (entityType !== "agl" && entityType !== "lha") return;
      const coords = features[0].geometry && "coordinates" in features[0].geometry
        ? (features[0].geometry as GeoJSON.Point).coordinates
        : [0, 0, 0];
      dragState.featureId = fId;
      dragState.featureType = entityType;
      dragState.originalAlt = coords[2] ?? 0;
      dragState.dragging = true;
      dragState.snapshot = snapshotSource(entityType === "agl" ? AGL_SOURCE : LHA_SOURCE);
      map.getCanvas().style.cursor = "grabbing";
      map.dragPan.disable();
      e.preventDefault();
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!dragState.dragging || !map || !dragState.snapshot) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!map || !dragState.snapshot) return;
        const newCoords: [number, number, number] = [e.lngLat.lng, e.lngLat.lat, dragState.originalAlt];
        const sourceName = dragState.featureType === "agl" ? AGL_SOURCE : LHA_SOURCE;
        const src = map.getSource(sourceName) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          const features = dragState.snapshot.map((f) => ({
            type: "Feature" as const,
            properties: f.properties,
            geometry: f.properties?.id === dragState.featureId
              ? { type: "Point" as const, coordinates: newCoords }
              : f.geometry,
          }));
          src.setData({ type: "FeatureCollection", features });
        }
      });
    }

    function handleMouseUp(e: maplibregl.MapMouseEvent) {
      if (!dragState.dragging || !map) return;
      cancelAnimationFrame(rafId);
      dragState.dragging = false;
      dragState.snapshot = null;
      map.getCanvas().style.cursor = "";
      map.dragPan.enable();
      onInfraPointDrag?.(
        dragState.featureType,
        dragState.featureId,
        [e.lngLat.lng, e.lngLat.lat, dragState.originalAlt],
      );
      dragState.featureId = "";
    }

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    return () => {
      cancelAnimationFrame(rafId);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [activeTool, interactive, onInfraPointDrag]);

  // click, hover, dblclick handler (transit insert/delete, feature selection, hover highlight)
  const TRANSIT_HOVER_SOURCE = "transit-hover-source";
  const TRANSIT_HOVER_LAYER = "transit-hover-ring";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    const tool = activeTool ?? MapTool.SELECT;
    let ghostActive = false;
    let hoveredTransitId: string | null = null;

    // ensure hover highlight source/layer exist (only when style is ready)
    function ensureHoverLayer() {
      if (!map || !map.isStyleLoaded()) return;
      if (map.getSource(TRANSIT_HOVER_SOURCE)) return;
      map.addSource(TRANSIT_HOVER_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: TRANSIT_HOVER_LAYER,
        type: "circle",
        source: TRANSIT_HOVER_SOURCE,
        paint: {
          "circle-radius": 12,
          "circle-color": "transparent",
          "circle-stroke-color": "#e54545",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.8,
        },
      });
    }
    if (map.isStyleLoaded()) {
      ensureHoverLayer();
    } else {
      map.once("style.load", ensureHoverLayer);
    }

    const ALL_WP_HOVER_LAYERS = [
      WAYPOINT_TRANSIT_CIRCLE_LAYER,
      WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
      WAYPOINT_TAKEOFF_LAYER,
      WAYPOINT_LANDING_LAYER,
      WAYPOINT_HOVER_LAYER,
    ];

    function updateWaypointHover(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const wpHoverLayers = ALL_WP_HOVER_LAYERS.filter((id) => {
        try { return map.getLayer(id); } catch { return false; }
      });
      if (wpHoverLayers.length === 0) return;
      // lazily create hover source if style is ready but source missing
      if (!map.getSource(TRANSIT_HOVER_SOURCE)) {
        try { ensureHoverLayer(); } catch { return; }
      }
      const hoverSrc = map.getSource(TRANSIT_HOVER_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!hoverSrc) return;

      const hits = map.queryRenderedFeatures(e.point, { layers: wpHoverLayers });
      if (hits.length > 0) {
        const wpId = hits[0].properties?.id;
        if (wpId && wpId !== hoveredTransitId) {
          hoveredTransitId = wpId;
          hoverSrc.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: hits[0].geometry }],
          });
        }
      } else if (hoveredTransitId) {
        hoveredTransitId = null;
        hoverSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // transit circle hover highlight (SELECT + MOVE_WAYPOINT)
      if (tool === MapTool.SELECT || tool === MapTool.MOVE_WAYPOINT) {
        updateWaypointHover(e);
      }

      // ghost waypoint on transit path (SELECT only, full map page only)
      if (tool !== MapTool.SELECT || !onTransitInsertRef.current) return;
      try { if (!map.getLayer(WAYPOINT_TRANSIT_HIT_LAYER)) return; } catch { return; }

      const features = map.queryRenderedFeatures(e.point, { layers: [WAYPOINT_TRANSIT_HIT_LAYER] });
      const ghostSrc = map.getSource(WAYPOINT_GHOST_TRANSIT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!ghostSrc) return;

      // don't show ghost when hovering an existing transit circle
      if (hoveredTransitId) {
        if (ghostActive) {
          ghostSrc.setData({ type: "FeatureCollection", features: [] });
          ghostActive = false;
        }
        return;
      }

      if (features.length > 0) {
        const alt = features[0].properties?.from_alt ?? 0;
        ghostSrc.setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { after_seq: features[0].properties?.from_seq ?? 0 },
            geometry: { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat, alt] },
          }],
        });
        if (!ghostActive) {
          map.getCanvas().style.cursor = "copy";
          ghostActive = true;
        }
      } else if (ghostActive) {
        ghostSrc.setData({ type: "FeatureCollection", features: [] });
        map.getCanvas().style.cursor = "";
        ghostActive = false;
      }
    }

    function handleClick(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // pick mode takes priority
      if (onMapClick) {
        onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }

      // only SELECT tool allows feature picking and transit insertion
      if (tool !== MapTool.SELECT) return;

      // skip re-selection when clicking vertex editor nodes/edges
      const vertexLayers = ["vertex-edit-corners", "vertex-edit-center", "vertex-edit-midpoints"]
        .filter((id) => { try { return map.getLayer(id); } catch { return false; } });
      if (vertexLayers.length > 0) {
        const vHits = map.queryRenderedFeatures(e.point, { layers: vertexLayers });
        if (vHits.length > 0) return;
      }

      // transit path click to insert (full map page only)
      try {
        if (onTransitInsertRef.current && map.getLayer(WAYPOINT_TRANSIT_HIT_LAYER)) {
          let onCircle = false;
          try {
            if (map.getLayer(WAYPOINT_TRANSIT_CIRCLE_LAYER)) {
              onCircle = map.queryRenderedFeatures(e.point, { layers: [WAYPOINT_TRANSIT_CIRCLE_LAYER] }).length > 0;
            }
          } catch { /* layer not ready */ }

          if (!onCircle) {
            const hitFeatures = map.queryRenderedFeatures(e.point, { layers: [WAYPOINT_TRANSIT_HIT_LAYER] });
            if (hitFeatures.length > 0) {
              const afterSeq = hitFeatures[0].properties?.from_seq ?? 0;
              const alt = hitFeatures[0].properties?.from_alt ?? 0;
              onTransitInsertRef.current?.([e.lngLat.lng, e.lngLat.lat, alt], afterSeq);
              return;
            }
          }
        }
      } catch { /* layer not ready */ }

      // query all interactive layers + waypoint layers in one pass
      const waypointQueryLayers = [
        WAYPOINT_TRANSIT_CIRCLE_LAYER,
        WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
        WAYPOINT_TAKEOFF_LAYER,
        WAYPOINT_LANDING_LAYER,
        WAYPOINT_HOVER_LAYER,
        SIMPLIFIED_TAKEOFF_LAYER,
        SIMPLIFIED_LANDING_LAYER,
      ];
      const allQueryLayers = [...INTERACTIVE_LAYERS, ...waypointQueryLayers].filter((id) => {
        try {
          return map.getLayer(id);
        } catch {
          return false;
        }
      });
      const features = map.queryRenderedFeatures(e.point, {
        layers: allQueryLayers,
      });

      if (!features.length) {
        setSelectedFeature(null);
        onFeatureClick?.(null);
        if (onWaypointClick) onWaypointClick(null);
        return;
      }

      // check for waypoint hit first (highest priority)
      const wpHit = features.find((f) =>
        waypointQueryLayers.includes(f.layer?.id ?? ""),
      );
      if (wpHit && wpHit.properties) {
        const wpId = String(wpHit.properties.id ?? "");
        if (wpId) {
          if (onWaypointClick) {
            onWaypointClick(selectedWaypointId === wpId ? null : wpId);
          }
          const coords = wpHit.geometry && "coordinates" in wpHit.geometry
            ? (wpHit.geometry as GeoJSON.Point).coordinates
            : [0, 0, 0];
          // maplibre strips Z from point geometries - read altitude from properties
          const alt = Number(wpHit.properties.altitude ?? coords[2] ?? 0);
          const stackCount = Number(wpHit.properties.stack_count ?? 1);
          // look up full waypoint data for camera fields (stacked ids are comma-separated)
          const firstId = wpId.includes(",") ? wpId.split(",")[0] : wpId;
          const fullWp = waypointsRef.current?.find((w) => w.id === firstId);
          setSelectedFeature({
            type: "waypoint",
            data: {
              id: wpId,
              waypoint_type: String(wpHit.properties.waypoint_type ?? ""),
              sequence_order: Number(wpHit.properties.sequence_order ?? 0),
              position: { type: "Point", coordinates: [coords[0], coords[1], alt] },
              stack_count: stackCount,
              seq_min: stackCount > 1 ? Number(wpHit.properties.seq_min) : undefined,
              seq_max: stackCount > 1 ? Number(wpHit.properties.seq_max) : undefined,
              alt_min: stackCount > 1 ? Number(wpHit.properties.alt_min) : undefined,
              alt_max: stackCount > 1 ? Number(wpHit.properties.alt_max) : undefined,
              heading: fullWp?.heading ?? null,
              speed: fullWp?.speed ?? null,
              camera_action: fullWp?.camera_action ?? null,
              camera_target: fullWp?.camera_target ?? null,
              gimbal_pitch: fullWp?.gimbal_pitch ?? null,
              hover_duration: fullWp?.hover_duration ?? null,
            },
          });
          return;
        }
      }

      // prioritize point/icon features over fill layers
      const pointFeature = features.find(
        (f) =>
          f.layer?.id !== SAFETY_ZONE_FILL_LAYER &&
          f.layer?.id !== SAFETY_ZONE_HATCH_LAYER &&
          f.layer?.id !== SAFETY_ZONE_BORDER_LAYER &&
          f.layer?.id !== OBSTACLE_BOUNDARY_LAYER,
      );
      const f = pointFeature ?? features[0];
      const props = f.properties;
      if (!props) return;

      const entityType = props.entityType as string;
      let mapFeature: MapFeature | null = null;

      if (entityType === "surface") {
        const surface = airport.surfaces.find((s) => s.id === props.id);
        if (surface) mapFeature = { type: "surface", data: surface };
      } else if (entityType === "obstacle") {
        const obstacle = airport.obstacles.find((o) => o.id === props.id);
        if (obstacle) mapFeature = { type: "obstacle", data: obstacle };
      } else if (entityType === "safety_zone") {
        const zone = airport.safety_zones.find((z) => z.id === props.id);
        if (zone) mapFeature = { type: "safety_zone", data: zone };
      } else if (entityType === "agl") {
        const agl = airport.surfaces
          .flatMap((s) => s.agls)
          .find((a) => a.id === props.id);
        if (agl) mapFeature = { type: "agl", data: agl };
      } else if (entityType === "lha") {
        const lha = airport.surfaces
          .flatMap((s) => s.agls)
          .flatMap((a) => a.lhas)
          .find((l) => l.id === props.id);
        if (lha) mapFeature = { type: "lha", data: lha };
      }

      if (mapFeature) {
        setSelectedFeature(mapFeature);
        // skip flyTo for map clicks - only double-click should fly
        skipFlyRef.current = true;
        onFeatureClick?.(mapFeature);
      }
    }

    function handleDblClick(e: maplibregl.MapMouseEvent) {
      if (!map || tool !== MapTool.SELECT) return;

      // transit waypoint double-click: delete if handler is provided (map editor only)
      try {
        if (onTransitDeleteRef.current && map.getLayer(WAYPOINT_TRANSIT_CIRCLE_LAYER)) {
          const transitHits = map.queryRenderedFeatures(e.point, {
            layers: [WAYPOINT_TRANSIT_CIRCLE_LAYER],
          });
          if (transitHits.length > 0 && transitHits[0].properties?.id) {
            e.preventDefault();
            onTransitDeleteRef.current(transitHits[0].properties.id);
            return;
          }
        }
      } catch { /* layer not ready */ }

      // double-click on any feature or waypoint: fly to it
      const waypointQueryLayers = [
        WAYPOINT_TRANSIT_CIRCLE_LAYER,
        WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
        WAYPOINT_TAKEOFF_LAYER,
        WAYPOINT_LANDING_LAYER,
        WAYPOINT_HOVER_LAYER,
        SIMPLIFIED_TAKEOFF_LAYER,
        SIMPLIFIED_LANDING_LAYER,
      ];
      const allQueryLayers = [...INTERACTIVE_LAYERS, ...waypointQueryLayers].filter((id) => {
        try { return map.getLayer(id); } catch { return false; }
      });
      const features = map.queryRenderedFeatures(e.point, { layers: allQueryLayers });
      if (features.length === 0) return;

      e.preventDefault();

      // get coordinates from the hit feature
      const hit = features[0];
      if (hit.geometry && "coordinates" in hit.geometry) {
        const coords = hit.geometry.coordinates as number[];
        map.flyTo({
          center: [coords[0], coords[1]],
          zoom: Math.max(map.getZoom(), 16),
          duration: 800,
        });
      }
    }

    map.on("mousemove", handleMouseMove);
    map.on("click", handleClick);
    map.on("dblclick", handleDblClick);
    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
      try {
        if (ghostActive) {
          map.getCanvas().style.cursor = "";
          const ghostSrc = map.getSource(WAYPOINT_GHOST_TRANSIT_SOURCE) as maplibregl.GeoJSONSource | undefined;
          if (ghostSrc) ghostSrc.setData({ type: "FeatureCollection", features: [] });
        }
        const hoverSrc = map.getSource(TRANSIT_HOVER_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (hoverSrc) hoverSrc.setData({ type: "FeatureCollection", features: [] });
      } catch { /* map already destroyed */ }
    };
  }, [airport, interactive, onFeatureClick, onWaypointClick, selectedWaypointId, onMapClick, activeTool]);

  // sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const [key, layerIds] of Object.entries(layerGroupMap)) {
      const visible = layerConfig[key as keyof MapLayerConfig];
      for (const layerId of layerIds) {
        try {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(
              layerId,
              "visibility",
              visible ? "visible" : "none",
            );
          }
        } catch {
          // layer may not exist yet
        }
      }
    }
  }, [layerConfig]);

  // mount-time guard - poll until the style is loaded then sync visibility once
  // so the LayerPanel toggle state matches actual MapLibre layer visibility
  // regardless of which layer-add path created the layers first.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    function trySync() {
      if (cancelled || !map) return;
      if (!map.isStyleLoaded()) {
        requestAnimationFrame(trySync);
        return;
      }
      syncLayerVisibility(map);
    }
    trySync();
    return () => {
      cancelled = true;
    };
  }, [airport, syncLayerVisibility]);

  // sync inspection visibility filters
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visibleInspectionIds) return;
    syncInspectionFilters(map);
  }, [visibleInspectionIds, syncInspectionFilters]);

  // terrain mode switch
  const handleTerrainChange = useCallback(
    (mode: "map" | "satellite") => {
      appliedTerrainRef.current = mode;
      setTerrainMode(mode);
      const map = mapRef.current;
      if (!map) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();

      layersAddedRef.current = false;
      cancelStylePollRef.current?.();

      // clear measurement and heading tools before style reset
      onMeasureClearRef.current?.();
      onHeadingClearRef.current?.();

      map.setStyle(mode === "satellite" ? makeSatelliteStyle() : makeMapStyle());

      cancelStylePollRef.current = waitForStyleLoaded(map, () => {
        if (!mapRef.current) return;

        map.setCenter(center);
        map.setZoom(zoom);
        map.setBearing(bearing);
        map.setPitch(pitch);

        addAllLayers(map);
        addWaypointLayers(map);

        for (const [key, layerIds] of Object.entries(layerGroupMap)) {
          const visible = layerConfig[key as keyof MapLayerConfig];
          for (const layerId of layerIds) {
            try {
              if (map.getLayer(layerId)) {
                map.setLayoutProperty(
                  layerId,
                  "visibility",
                  visible ? "visible" : "none",
                );
              }
            } catch {
              // layer may not exist yet
            }
          }
        }
      });
    },
    [airport, layerConfig, addAllLayers, addWaypointLayers, setTerrainMode],
  );

  // sync terrain mode when changed externally (e.g. from parent toggle)
  useEffect(() => {
    if (terrainMode !== appliedTerrainRef.current) {
      appliedTerrainRef.current = terrainMode;
      handleTerrainChange(terrainMode);
    }
  }, [terrainMode, handleTerrainChange]);

  const TRAJECTORY_CHILDREN: (keyof MapLayerConfig)[] = [
    "transitWaypoints", "measurementWaypoints", "path", "takeoffLanding", "cameraHeading", "pathHeading",
  ];

  const handleLayerToggle = useCallback((key: string) => {
    /** toggle a layer with parent-child cascade and mutual exclusion. */
    setLayerConfig((prev) => {
      const next = { ...prev };

      if (key === "simplifiedTrajectory") {
        next.simplifiedTrajectory = !prev.simplifiedTrajectory;
        if (next.simplifiedTrajectory) {
          next.trajectory = false;
          for (const k of TRAJECTORY_CHILDREN) next[k] = false;
        }
        return next;
      }

      if (key === "trajectory") {
        next.trajectory = !prev.trajectory;
        if (next.trajectory) {
          next.simplifiedTrajectory = false;
          next.transitWaypoints = true;
          next.measurementWaypoints = true;
          next.path = true;
          next.takeoffLanding = true;
          next.cameraHeading = false;
          next.pathHeading = true;
        } else {
          for (const k of TRAJECTORY_CHILDREN) next[k] = false;
        }
        return next;
      }

      // "waypoints" virtual parent
      if (key === "waypoints") {
        const newVal = !(prev.transitWaypoints && prev.measurementWaypoints);
        next.transitWaypoints = newVal;
        next.measurementWaypoints = newVal;
        if (newVal) {
          next.trajectory = true;
          next.simplifiedTrajectory = false;
        }
        return next;
      }

      // individual toggle
      const k = key as keyof MapLayerConfig;
      if (k in next) {
        next[k] = !prev[k];

        // if a trajectory child toggled on, ensure parent on + simplified off
        if (TRAJECTORY_CHILDREN.includes(key as keyof MapLayerConfig)) {
          const anyOn = TRAJECTORY_CHILDREN.some((k) => next[k]);
          next.trajectory = anyOn;
          if (anyOn) next.simplifiedTrajectory = false;
        }
      }

      return next;
    });
  }, []);

  // wasd / arrow key navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    const PAN_STEP = 80;
    const keyMap: Record<string, [number, number]> = {
      ArrowUp: [0, -PAN_STEP],
      ArrowLeft: [-PAN_STEP, 0],
      ArrowDown: [0, PAN_STEP],
      ArrowRight: [PAN_STEP, 0],
    };

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const delta = keyMap[e.key];
      if (delta && map) {
        e.preventDefault();
        map.panBy(delta, { duration: 200 });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [interactive]);

  // pan tool: grab/grabbing cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;
    const tool = activeTool ?? MapTool.SELECT;
    if (tool !== MapTool.PAN) return;

    function handleMouseDown() {
      if (map) map.getCanvas().style.cursor = "grabbing";
    }
    function handleMouseUp() {
      if (map) map.getCanvas().style.cursor = "grab";
    }

    map.getCanvas().addEventListener("mousedown", handleMouseDown);
    map.getCanvas().addEventListener("mouseup", handleMouseUp);
    return () => {
      map.getCanvas().removeEventListener("mousedown", handleMouseDown);
      map.getCanvas().removeEventListener("mouseup", handleMouseUp);
    };
  }, [interactive, activeTool]);

  // measure tool layers — defined as standalone function, called from addAllLayers

  // sync measure data to sources - ensure layers exist first
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function sync() {
      /** push measure geojson into map sources. */
      if (!map) return;
      if (!map.getSource("measure-points")) addMeasureLayersToMap(map);

      const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      const points = measureData?.points ?? emptyFC;
      const lines = measureData?.lines ?? emptyFC;
      const labels = measureData?.labels ?? emptyFC;

      const pointsSrc = map.getSource("measure-points") as maplibregl.GeoJSONSource | undefined;
      const linesSrc = map.getSource("measure-lines") as maplibregl.GeoJSONSource | undefined;
      const labelsSrc = map.getSource("measure-labels") as maplibregl.GeoJSONSource | undefined;

      if (pointsSrc) pointsSrc.setData(points);
      if (linesSrc) linesSrc.setData(lines);
      if (labelsSrc) labelsSrc.setData(labels);
    }

    if (map.isStyleLoaded()) {
      sync();
    } else {
      const cancel = waitForStyleLoaded(map, sync);
      return cancel;
    }
  }, [measureData]);

  // sync heading data to sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function sync() {
      /** push heading geojson into map sources. */
      if (!map) return;

      // only add layers if sources missing (first call or after style change)
      if (!map.getSource("heading-point")) addHeadingLayersToMap(map);

      const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      const point = headingData?.point ?? emptyFC;
      const line = headingData?.line ?? emptyFC;
      const label = headingData?.label ?? emptyFC;

      const pointSrc = map.getSource("heading-point") as maplibregl.GeoJSONSource | undefined;
      const lineSrc = map.getSource("heading-line") as maplibregl.GeoJSONSource | undefined;
      const labelSrc = map.getSource("heading-label") as maplibregl.GeoJSONSource | undefined;

      if (pointSrc) pointSrc.setData(point);
      if (lineSrc) lineSrc.setData(line);
      if (labelSrc) labelSrc.setData(label);
    }

    if (map.isStyleLoaded()) {
      sync();
    } else {
      const cancel = waitForStyleLoaded(map, sync);
      return cancel;
    }
  }, [headingData]);

  return (
    <div
      className="relative h-full w-full rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--tv-map-bg)" }}
      data-testid="airport-map"
    >
      <div ref={containerRef} className="h-full w-full" style={{ display: is3D ? "none" : "block" }} />

      {/* cesium 3d viewer - lazy loaded on first 3d toggle */}
      {cesiumLoaded && (
        <div className="absolute inset-0" style={{ display: is3D ? "block" : "none" }}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full w-full text-tv-text-secondary text-sm">
                {t("map.loading3d")}
              </div>
            }
          >
            <LazyCesiumMapViewer
              airport={airport}
              layers={layerConfig}
              waypoints={waypoints}
              selectedWaypointId={selectedWaypointId}
              takeoffCoordinate={takeoffCoordinate}
              landingCoordinate={landingCoordinate}
              visibleInspectionIds={visibleInspectionIds}
              inspectionIndexMap={inspectionIndexMap}
              terrainMode={terrainMode}
              onFeatureClick={(f) => setSelectedFeature(f)}
              onWaypointClick={onWaypointClick}
              onBearingChange={setBearing}

              onViewerReady={(viewer) => {
                cesiumViewerRef.current = viewer;
                syncToCesium(viewer);
              }}
              focusFeature={focusFeature}
              highlightedWaypointIds={highlightedWaypointIds}
              highlightSeverity={highlightSeverity}
            />
          </Suspense>
        </div>
      )}

      {/* top-left: layers, waypoints, poi info */}
      {(showLayerPanel || showWaypointList || showPoiInfo || leftPanelChildren) && (
        <div
          className="absolute top-3 left-3 z-10 flex flex-col gap-2 w-[280px] overflow-y-auto pr-1"
          style={{ maxHeight: "calc(100% - 68px)", scrollbarGutter: "stable" }}
        >
          {showLayerPanel && (
            <LayerPanel
              layers={layerConfig}
              onToggle={handleLayerToggle}
              hasFlightPlan={!!(waypoints?.length)}
              hasTakeoffLanding={!!(takeoffCoordinate || landingCoordinate)}
            />
          )}
          {leftPanelChildren}
          {showWaypointList && layerConfig.trajectory && !layerConfig.simplifiedTrajectory && (waypoints?.length || takeoffCoordinate || landingCoordinate) ? (
            <WaypointListPanel
              waypoints={waypoints ?? []}
              selectedId={selectedWaypointId ?? null}
              onSelect={handleWaypointListSelect}
              takeoffCoordinate={takeoffCoordinate}
              landingCoordinate={landingCoordinate}
              visibleInspectionIds={visibleInspectionIds}
            />
          ) : null}
          {showPoiInfo && (
            <PoiInfoPanel
              feature={selectedFeature}
              onClose={() => setSelectedFeature(null)}
              surfaces={airport.surfaces}
            />
          )}
          {selectedWarning && onWarningClose && (
            <WarningInfoPanel
              violation={selectedWarning}
              onClose={onWarningClose}
            />
          )}

          {/* placement buttons - full width, after waypoint list */}
          {!takeoffCoordinate && onPlaceTakeoff && (
            <button
              onClick={onPlaceTakeoff}
              className="flex items-center justify-center gap-2 w-full rounded-2xl px-3 py-2 text-xs font-semibold border border-tv-success text-white transition-colors"
              style={{ backgroundColor: "var(--tv-success)" }}
              data-testid="place-takeoff-btn"
            >
              <Flag className="h-3.5 w-3.5" />
              {t("map.placeTakeoff")}
            </button>
          )}
          {!landingCoordinate && onPlaceLanding && (
            <button
              onClick={onPlaceLanding}
              className="flex items-center justify-center gap-2 w-full rounded-2xl px-3 py-2 text-xs font-semibold border border-tv-error text-white transition-colors"
              style={{ backgroundColor: "var(--tv-error)" }}
              data-testid="place-landing-btn"
            >
              <Flag className="h-3.5 w-3.5" />
              {t("map.placeLanding")}
            </button>
          )}
        </div>
      )}

      {/* top-right: legend */}
      {showLegend && (
        <LegendPanel
          missionStatus={missionStatus}
          hasTakeoff={!!takeoffCoordinate}
          hasLanding={!!landingCoordinate}
          layers={layerConfig}
        />
      )}

      {/* bottom-left: map help */}
      {showHelpPanel && (
        <div className="absolute bottom-3 left-3 z-10">
          <MapHelpPanel variant={helpVariant} />
        </div>
      )}

      {/* right side: compass + zoom controls */}
      {(showCompass || showZoomControls) && (
        <div className="absolute right-3 z-20 flex flex-col items-center gap-1.5" style={{ bottom: "60px" }}>
          {showCompass && (
            <button
              onClick={() => {
                if (is3D && cesiumViewerRef.current && !cesiumViewerRef.current.isDestroyed()) {
                  const cam = cesiumViewerRef.current.camera;
                  cam.flyTo({
                    destination: cam.positionWC,
                    orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
                    duration: 0.4,
                  });
                } else {
                  const map = mapRef.current;
                  if (map) map.easeTo({ bearing: 0, duration: 400 });
                }
              }}
              title={t("map.resetNorth")}
              className="relative flex items-center justify-center w-11 h-11 rounded-full border border-tv-border bg-tv-surface hover:bg-tv-surface-hover transition-colors"
              data-testid="compass-btn"
            >
              {/* rotating compass dial */}
              <svg
                className="w-9 h-9"
                viewBox="0 0 36 36"
                style={{ transform: `rotate(${-bearing}deg)` }}
              >
                {/* N marker - red */}
                <text x="18" y="7" textAnchor="middle" dominantBaseline="middle" fill="#e54545" fontSize="7" fontWeight="bold">N</text>
                {/* S marker */}
                <text x="18" y="31" textAnchor="middle" dominantBaseline="middle" fill="var(--tv-text-muted)" fontSize="6">S</text>
                {/* E marker */}
                <text x="31" y="18.5" textAnchor="middle" dominantBaseline="middle" fill="var(--tv-text-muted)" fontSize="6">E</text>
                {/* W marker */}
                <text x="5" y="18.5" textAnchor="middle" dominantBaseline="middle" fill="var(--tv-text-muted)" fontSize="6">W</text>
                {/* needle - north half red, south half white */}
                <polygon points="18,10 16.5,18 19.5,18" fill="#e54545" />
                <polygon points="18,26 16.5,18 19.5,18" fill="var(--tv-text-muted)" />
              </svg>
            </button>
          )}
          {showZoomControls && (
            <div className="flex flex-col rounded-full border border-tv-border bg-tv-surface overflow-hidden">
              <button
                onClick={() => {
                  const map = mapRef.current;
                  if (map) map.zoomTo(map.getZoom() + 1, { duration: 300 });
                }}
                title={t("map.zoomIn")}
                className="flex items-center justify-center w-8 h-8 text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="zoom-in-btn"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="h-px bg-tv-border" />
              <button
                onClick={() => {
                  const map = mapRef.current;
                  if (map) map.zoomTo(map.getZoom() - 1, { duration: 300 });
                }}
                title={t("map.zoomOut")}
                className="flex items-center justify-center w-8 h-8 text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="zoom-out-btn"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
});

export default AirportMap;
