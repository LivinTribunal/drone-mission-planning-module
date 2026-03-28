import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { AirportMapProps, MapFeature, MapLayerConfig } from "@/types/map";
import type { WaypointResponse } from "@/types/flightPlan";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import { MapTool } from "@/hooks/useMapTools";
import {
  TOOL_CURSOR_MOVE,
  TOOL_CURSOR_MEASURE,
} from "@/utils/cursors";
import { registerAllMapImages } from "./layers/mapImages";
import {
  addSurfaceLayers,
  RUNWAY_FILL_LAYER,
  RUNWAY_STROKE_LAYER,
  RUNWAY_CENTERLINE_LAYER,
  RUNWAY_LABEL_LAYER,
  TAXIWAY_FILL_LAYER,
  TAXIWAY_STROKE_LAYER,
  TAXIWAY_LABEL_LAYER,
} from "./layers/surfaceLayers";
import {
  addObstacleLayers,
  OBSTACLE_ICON_LAYER,
  OBSTACLE_RADIUS_LAYER,
  OBSTACLE_LABEL_LAYER,
} from "./layers/obstacleLayers";
import {
  addSafetyZoneLayers,
  SAFETY_ZONE_FILL_LAYER,
  SAFETY_ZONE_HATCH_LAYER,
  SAFETY_ZONE_BORDER_LAYER,
  SAFETY_ZONE_LABEL_LAYER,
} from "./layers/safetyZoneLayers";
import {
  addAglLayers,
  AGL_POINT_LAYER,
  AGL_LABEL_LAYER,
  LHA_POINT_LAYER,
  LHA_LABEL_LAYER,
} from "./layers/aglLayers";
import {
  addWaypointLayers as addWaypointLayersFn,
  addSimplifiedTrajectoryLayers,
  updateSelectedFilter,
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
} from "./layers/waypointLayers";
import LayerPanel from "./overlays/LayerPanel";
import LegendPanel from "./overlays/LegendPanel";
import PoiInfoPanel from "./overlays/PoiInfoPanel";
import MapHelpPanel from "./overlays/MapHelpPanel";
import WaypointListPanel from "./overlays/WaypointListPanel";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

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
  taxiways: [TAXIWAY_FILL_LAYER, TAXIWAY_STROKE_LAYER, TAXIWAY_LABEL_LAYER],
  obstacles: [OBSTACLE_ICON_LAYER, OBSTACLE_RADIUS_LAYER, "obstacles-radius-outline", OBSTACLE_LABEL_LAYER],
  safetyZones: [
    SAFETY_ZONE_FILL_LAYER,
    SAFETY_ZONE_HATCH_LAYER,
    SAFETY_ZONE_BORDER_LAYER,
    SAFETY_ZONE_LABEL_LAYER,
  ],
  aglSystems: [AGL_POINT_LAYER, AGL_LABEL_LAYER, LHA_POINT_LAYER, LHA_LABEL_LAYER],
  transitWaypoints: [WAYPOINT_TRANSIT_CIRCLE_LAYER],
  measurementWaypoints: [WAYPOINT_MEASUREMENT_CIRCLE_LAYER, WAYPOINT_HOVER_LAYER, WAYPOINT_LABEL_LAYER],
  path: [WAYPOINT_LINE_LAYER],
  takeoffLanding: [WAYPOINT_TAKEOFF_LAYER, WAYPOINT_LANDING_LAYER],
  cameraHeading: [WAYPOINT_CAMERA_LINE_LAYER],
  pathHeading: [WAYPOINT_ARROW_LAYER],
};

// all interactive layer ids for click handling
const INTERACTIVE_LAYERS = [
  RUNWAY_FILL_LAYER,
  TAXIWAY_FILL_LAYER,
  OBSTACLE_ICON_LAYER,
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
];

// cursor styles per active tool
const TOOL_CURSORS: Record<string, string> = {
  [MapTool.SELECT]: "default",
  [MapTool.PAN]: "grab",
  [MapTool.MOVE_WAYPOINT]: TOOL_CURSOR_MOVE,
  [MapTool.MEASURE]: TOOL_CURSOR_MEASURE,
  [MapTool.ZOOM]: "zoom-in",
  [MapTool.PLACE_TAKEOFF]: "crosshair",
  [MapTool.PLACE_LANDING]: "crosshair",
};

export default function AirportMap({
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
  onMeasureMouseMove,
  onWaypointDrag,
  zoomPercent,
  onZoomChange,
}: AirportMapProps & { activeTool?: MapTool }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersAddedRef = useRef(false);
  const suppressZoomEndRef = useRef(false);
  const waypointsRef = useRef(waypoints);
  const takeoffRef = useRef(takeoffCoordinate);
  takeoffRef.current = takeoffCoordinate;
  const landingRef = useRef(landingCoordinate);
  landingRef.current = landingCoordinate;
  const indexMapRef = useRef(inspectionIndexMap);
  indexMapRef.current = inspectionIndexMap;

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
    if (tool === MapTool.PAN) {
      map.dragPan.enable();
    } else {
      map.dragPan.disable();
    }
    return () => {
      if (map.dragPan) map.dragPan.enable();
    };
  }, [activeTool, interactive]);

  // measure tool: contextmenu to clear, mousemove for cursor line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tool = activeTool ?? MapTool.SELECT;

    if (tool !== MapTool.MEASURE) {
      onMeasureClear?.();
      return;
    }

    function handleContextMenu(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      onMeasureClear?.();
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      onMeasureMouseMove?.(e.lngLat.lng, e.lngLat.lat);
    }

    map.on("contextmenu", handleContextMenu);
    map.on("mousemove", handleMouseMove);
    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("mousemove", handleMouseMove);
    };
  }, [activeTool, onMeasureClear, onMeasureMouseMove]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function handleZoomEnd() {
      if (!map) return;
      if (suppressZoomEndRef.current) {
        suppressZoomEndRef.current = false;
        return;
      }
      const currentZoom = map.getZoom();
      const percent = Math.round((currentZoom / 14.5) * 100);
      onZoomChangeRef.current?.(percent);
    }

    map.on("zoomend", handleZoomEnd);
    return () => { map.off("zoomend", handleZoomEnd); };
  }, []);

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

    return () => {
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, [airport.id, interactive]);

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

  // shared helper to add all infrastructure layers
  const addAllLayers = useCallback(
    (map: maplibregl.Map) => {
      if (layersAddedRef.current) return;
      registerAllMapImages(map);
      addSafetyZoneLayers(map, airport.safety_zones);
      addSurfaceLayers(map, airport.surfaces);
      addObstacleLayers(map, airport.obstacles);
      addAglLayers(map, airport.surfaces);
      addMeasureLayersToMap(map);
      layersAddedRef.current = true;
    },
    [airport],
  );

  // add infrastructure layers once map + airport data are ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      if (!map) return;
      addAllLayers(map);
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.on("load", addLayers);
    }

    return () => {
      map.off("load", addLayers);
    };
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
  const addWaypointLayers = useCallback((map: maplibregl.Map, wpsOverride?: WaypointResponse[]) => {
    const wps = wpsOverride ?? waypointsRef.current;
    const takeoff = takeoffRef.current;
    const landing = landingRef.current;
    const idxMap = indexMapRef.current;

    registerAllMapImages(map);
    addWaypointLayersFn(map, wps ?? [], takeoff, landing, selectedWaypointId, idxMap);
    addSimplifiedTrajectoryLayers(map, wps ?? [], takeoff, landing);

    // re-sync visibility and filters after layers are added
    syncLayerVisibility(map);
    syncInspectionFilters(map);
  }, [selectedWaypointId, syncLayerVisibility, syncInspectionFilters]);

  // sync waypoints ref and re-render layers when waypoints or coords change
  useEffect(() => {
    waypointsRef.current = waypoints;
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      addWaypointLayers(map, waypoints ?? undefined);
    } else {
      const handler = () => addWaypointLayers(map, waypoints ?? undefined);
      map.on("load", handler);
      return () => { map.off("load", handler); };
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
        },
      });
    }
  }, [selectedWaypointId]);

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

  // click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    function handleClick(e: maplibregl.MapMouseEvent) {
      if (!map) return;

      // pick mode takes priority
      if (onMapClick) {
        onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }

      // only SELECT tool allows feature picking
      const tool = activeTool ?? MapTool.SELECT;
      if (tool !== MapTool.SELECT) return;

      // query all interactive layers + waypoint layers in one pass
      const waypointQueryLayers = [
        WAYPOINT_TRANSIT_CIRCLE_LAYER,
        WAYPOINT_MEASUREMENT_CIRCLE_LAYER,
        WAYPOINT_TAKEOFF_LAYER,
        WAYPOINT_LANDING_LAYER,
        WAYPOINT_HOVER_LAYER,
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
          const stackCount = Number(wpHit.properties.stack_count ?? 1);
          setSelectedFeature({
            type: "waypoint",
            data: {
              id: wpId,
              waypoint_type: String(wpHit.properties.waypoint_type ?? ""),
              sequence_order: Number(wpHit.properties.sequence_order ?? 0),
              position: { type: "Point", coordinates: [coords[0], coords[1], coords[2] ?? 0] },
              stack_count: stackCount,
              seq_min: stackCount > 1 ? Number(wpHit.properties.seq_min) : undefined,
              seq_max: stackCount > 1 ? Number(wpHit.properties.seq_max) : undefined,
              alt_min: stackCount > 1 ? Number(wpHit.properties.alt_min) : undefined,
              alt_max: stackCount > 1 ? Number(wpHit.properties.alt_max) : undefined,
            },
          });
          return;
        }
      }

      // prioritize point features over fill layers
      const pointFeature = features.find(
        (f) =>
          f.layer?.id !== SAFETY_ZONE_FILL_LAYER &&
          f.layer?.id !== SAFETY_ZONE_HATCH_LAYER &&
          f.layer?.id !== SAFETY_ZONE_BORDER_LAYER,
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
        onFeatureClick?.(mapFeature);
      }
    }

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
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

      map.setStyle(mode === "satellite" ? makeSatelliteStyle() : makeMapStyle());

      map.once("style.load", () => {
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
    if (!map || !map.isStyleLoaded()) return;

    // ensure measure layers exist (may have been lost after style change)
    addMeasureLayersToMap(map);

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
  }, [measureData]);

  return (
    <div
      className="relative h-full w-full rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--tv-map-bg)" }}
      data-testid="airport-map"
    >
      <div ref={containerRef} className="h-full w-full" />

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
              hasWaypoints={!!(waypoints?.length || takeoffCoordinate || landingCoordinate)}
              hasSimplifiedTrajectory={!!(waypoints?.length)}
              hasTakeoff={!!takeoffCoordinate}
              hasLanding={!!landingCoordinate}
              onPlaceTakeoff={onPlaceTakeoff}
              onPlaceLanding={onPlaceLanding}
            />
          )}
          {leftPanelChildren}
          {showWaypointList && layerConfig.trajectory && !layerConfig.simplifiedTrajectory && (waypoints?.length || takeoffCoordinate || landingCoordinate) ? (
            <WaypointListPanel
              waypoints={waypoints ?? []}
              selectedId={selectedWaypointId ?? null}
              onSelect={onWaypointClick ?? (() => {})}
              takeoffCoordinate={takeoffCoordinate}
              landingCoordinate={landingCoordinate}
              visibleInspectionIds={visibleInspectionIds}
            />
          ) : null}
          {showPoiInfo && (
            <PoiInfoPanel
              feature={selectedFeature}
              onClose={() => setSelectedFeature(null)}
            />
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
      <div className="absolute bottom-3 left-3 z-10">
        <MapHelpPanel />
      </div>

      {children}
    </div>
  );
}
