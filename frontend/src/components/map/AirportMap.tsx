import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { AirportMapProps, MapFeature, MapLayerConfig } from "@/types/map";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
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
import TerrainToggle from "./overlays/TerrainToggle";
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
// trajectory is a virtual parent with no own layers
const layerGroupMap: Partial<Record<keyof MapLayerConfig, string[]>> = {
  simplifiedTrajectory: getSimplifiedTrajectoryLayerIds(),
  runways: [
    RUNWAY_FILL_LAYER,
    RUNWAY_STROKE_LAYER,
    RUNWAY_CENTERLINE_LAYER,
    RUNWAY_LABEL_LAYER,
  ],
  taxiways: [TAXIWAY_FILL_LAYER, TAXIWAY_STROKE_LAYER, TAXIWAY_LABEL_LAYER],
  obstacles: [OBSTACLE_ICON_LAYER, OBSTACLE_RADIUS_LAYER, OBSTACLE_LABEL_LAYER],
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

export default function AirportMap({
  airport,
  layers: layersProp,
  interactive = true,
  showLayerPanel = true,
  showLegend = true,
  showPoiInfo = true,
  showTerrainToggle = true,
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
}: AirportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersAddedRef = useRef(false);
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

  // initialize map
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, [airport.id, interactive]);

  // shared helper to add all infrastructure layers
  const addAllLayers = useCallback(
    (map: maplibregl.Map) => {
      if (layersAddedRef.current) return;
      registerAllMapImages(map);
      addSafetyZoneLayers(map, airport.safety_zones);
      addSurfaceLayers(map, airport.surfaces);
      addObstacleLayers(map, airport.obstacles);
      addAglLayers(map, airport.surfaces);
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
  const addWaypointLayers = useCallback((map: maplibregl.Map) => {
    const wps = waypointsRef.current;
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
      addWaypointLayers(map);
    } else {
      const handler = () => addWaypointLayers(map);
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

  // cursor and hover effects
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    function handleMouseEnter() {
      if (map) map.getCanvas().style.cursor = "pointer";
    }
    function handleMouseLeave() {
      if (map) map.getCanvas().style.cursor = "";
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
  }, [interactive]);

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
  }, [airport, interactive, onFeatureClick, onWaypointClick, selectedWaypointId, onMapClick]);

  // sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function syncVisibility() {
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
    }

    if (map.isStyleLoaded()) {
      syncVisibility();
    } else {
      map.on("load", syncVisibility);
    }

    return () => {
      map.off("load", syncVisibility);
    };
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
      w: [0, -PAN_STEP],
      a: [-PAN_STEP, 0],
      s: [0, PAN_STEP],
      d: [PAN_STEP, 0],
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

  return (
    <div
      className="relative h-full w-full rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--tv-map-bg)" }}
      data-testid="airport-map"
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* top-left: layers, waypoints, poi info */}
      <div
        className="absolute top-3 left-3 z-10 flex flex-col gap-2 w-[220px] overflow-y-auto"
        style={{ maxHeight: "calc(100% - 68px)" }}
      >
        {showLayerPanel && (
          <LayerPanel
            layers={layerConfig}
            onToggle={handleLayerToggle}
            hasWaypoints={!!(waypoints?.length || takeoffCoordinate || landingCoordinate)}
            hasSimplifiedTrajectory={!!(waypoints?.length)}
          />
        )}
        {showWaypointList && layerConfig.trajectory && (waypoints?.length || takeoffCoordinate || landingCoordinate) ? (
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

      {/* bottom-right: terrain toggle */}
      {showTerrainToggle && (
        <TerrainToggle mode={terrainMode} onToggle={handleTerrainChange} />
      )}

      {children}
    </div>
  );
}
