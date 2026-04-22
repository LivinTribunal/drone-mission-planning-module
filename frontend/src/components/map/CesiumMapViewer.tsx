import { useEffect, useRef, useState, useCallback } from "react";
import { Viewer } from "resium";
import {
  Ion,
  Cartesian3,
  Cartographic,
  Terrain,
  IonImageryProvider,
  UrlTemplateImageryProvider,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
  Cartesian2,
  Math as CesiumMath,
  Viewer as CesiumViewerType,
  Entity as CesiumEntity,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AirportDetailResponse } from "@/types/airport";
import type { WaypointResponse } from "@/types/flightPlan";
import type { PointZ } from "@/types/common";
import type { LocateRequest, MapLayerConfig, MapFeature, MapFeatureType } from "@/types/map";
import { flyCesiumToFeature } from "@/hooks/useFocusFeature";
import CesiumInfrastructure from "./cesium/CesiumInfrastructure";
import CesiumTrajectory from "./cesium/CesiumTrajectory";


// set ion token from env
const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
}

interface CesiumMapViewerProps {
  airport: AirportDetailResponse;
  layers: MapLayerConfig;
  waypoints?: WaypointResponse[];
  selectedWaypointId?: string | null;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  visibleInspectionIds?: Set<string>;
  terrainMode: "map" | "satellite";
  onFeatureClick?: (feature: MapFeature | null) => void;
  onWaypointClick?: (id: string | null) => void;
  onBearingChange?: (bearing: number) => void;
  onViewerReady?: (viewer: CesiumViewerType) => void;
  focusFeature?: MapFeature | null;
  locateRequest?: LocateRequest | null;
  highlightedWaypointIds?: string[] | null;
}

const VALID_FEATURE_TYPES: ReadonlySet<string> = new Set<MapFeatureType>([
  "surface", "obstacle", "safety_zone", "agl", "lha", "waypoint",
]);

/** type guard to validate a raw string is a known map feature type. */
function isMapFeatureType(value: unknown): value is MapFeatureType {
  return typeof value === "string" && VALID_FEATURE_TYPES.has(value);
}

/** look up full entity data from airport/waypoints by type and id to construct a proper MapFeature. */
function lookupFeature(
  airport: AirportDetailResponse,
  type: MapFeatureType,
  id: string,
  waypoints?: WaypointResponse[],
  takeoffCoord?: PointZ | null,
  landingCoord?: PointZ | null,
): MapFeature | null {
  switch (type) {
    case "surface": {
      const data = (airport.surfaces ?? []).find((s) => s.id === id);
      return data ? { type: "surface", data } : null;
    }
    case "obstacle": {
      const data = (airport.obstacles ?? []).find((o) => o.id === id);
      return data ? { type: "obstacle", data } : null;
    }
    case "safety_zone": {
      const data = (airport.safety_zones ?? []).find((z) => z.id === id);
      return data ? { type: "safety_zone", data } : null;
    }
    case "agl": {
      for (const surface of airport.surfaces ?? []) {
        const data = (surface.agls ?? []).find((a) => a.id === id);
        if (data) return { type: "agl", data };
      }
      return null;
    }
    case "lha": {
      for (const surface of airport.surfaces ?? []) {
        for (const agl of surface.agls ?? []) {
          const data = (agl.lhas ?? []).find((l) => l.id === id);
          if (data) return { type: "lha", data };
        }
      }
      return null;
    }
    case "waypoint": {
      const wp = (waypoints ?? []).find((w) => w.id === id);
      if (wp) {
        return {
          type: "waypoint",
          data: {
            id: wp.id,
            waypoint_type: wp.waypoint_type,
            sequence_order: wp.sequence_order,
            position: wp.position,
            stack_count: 1,
            heading: wp.heading,
            speed: wp.speed,
            camera_action: wp.camera_action,
            camera_target: wp.camera_target,
            gimbal_pitch: wp.gimbal_pitch,
          },
        };
      }

      // standalone takeoff/landing from mission coordinates
      const coord = id === "takeoff" ? takeoffCoord : id === "landing" ? landingCoord : null;
      if (coord) {
        return {
          type: "waypoint",
          data: {
            id,
            waypoint_type: id === "takeoff" ? "TAKEOFF" : "LANDING",
            sequence_order: 0,
            position: coord,
            stack_count: 1,
            heading: null,
            speed: null,
            camera_action: null,
            camera_target: null,
            gimbal_pitch: null,
          },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

/** 3d globe visualization using cesiumjs with terrain, infrastructure, and trajectory rendering. */
export default function CesiumMapViewer({
  airport,
  layers,
  waypoints = [],
  selectedWaypointId,
  takeoffCoordinate,
  landingCoordinate,
  visibleInspectionIds,
  terrainMode,
  onFeatureClick,
  onWaypointClick,
  onBearingChange,
  onViewerReady,
  focusFeature,
  locateRequest,
  highlightedWaypointIds,
}: CesiumMapViewerProps) {
  const viewerRef = useRef<CesiumViewerType | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const [initialized, setInitialized] = useState(false);
  // selected feature id for declarative highlight overlay
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(null);

  // offset between cesium terrain (ellipsoidal height) and airport MSL elevation.
  // polylines need this because they don't support heightReference.
  const [terrainOffset, setTerrainOffset] = useState(0);

  // keep callbacks in refs to avoid stale closures in the click handler
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onWaypointClickRef = useRef(onWaypointClick);
  onWaypointClickRef.current = onWaypointClick;
  const onBearingChangeRef = useRef(onBearingChange);
  onBearingChangeRef.current = onBearingChange;
  const airportRef = useRef(airport);
  airportRef.current = airport;
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const takeoffCoordRef = useRef(takeoffCoordinate);
  takeoffCoordRef.current = takeoffCoordinate;
  const landingCoordRef = useRef(landingCoordinate);
  landingCoordRef.current = landingCoordinate;

  // stable ref callback - only initializes once
  const viewerRefCallback = useCallback(
    (ref: { cesiumElement?: CesiumViewerType } | null) => {
      const viewer = ref?.cesiumElement;
      if (!viewer || viewerRef.current === viewer) return;
      viewerRef.current = viewer;
      setInitialized(true);
    },
    [],
  );

  /** clear selection state. */
  const clearSelection = useCallback(() => {
    setSelectedFeatureKey(null);
  }, []);

  /** select a feature by building a key from its entity properties. */
  const selectEntity = useCallback((entity: CesiumEntity) => {
    const props = entity.properties;
    if (!props) {
      setSelectedFeatureKey(null);
      return;
    }
    const fType = props.featureType?.getValue();
    const fId = props.featureId?.getValue();
    if (fType && fId) {
      setSelectedFeatureKey(`${fType}:${fId}`);
    }
  }, []);

  // initialize viewer once when ref is first set
  useEffect(() => {
    const viewerMaybe = viewerRef.current;
    if (!initialized || !viewerMaybe || viewerMaybe.isDestroyed()) return;
    // rebind as non-nullable - tsc loses the null guard across nested closures below
    const viewer: CesiumViewerType = viewerMaybe;

    // enable depth test against terrain
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // render at native resolution on retina displays
    viewer.resolutionScale = window.devicePixelRatio;

    // disable viewer's built-in click handler to prevent interference with custom pick
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_CLICK,
    );
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );

    // load terrain - triggers terrainOffset recompute via tileLoadProgress listener
    viewer.scene.setTerrain(Terrain.fromWorldTerrain());

    // fly to airport
    const [lng, lat] = airport.location.coordinates;
    const elevation = airport.elevation ?? 0;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(lng, lat, elevation + 2000),
      orientation: {
        heading: 0,
        pitch: -0.7854, // -45 degrees
        roll: 0,
      },
    });

    // shared pick + select body for single + double click
    function pickAndSelect(event: { position: Cartesian2 }): MapFeature | null {
      // drillPick penetrates terrain so waypoints rendered via
      // disableDepthTestDistance are clickable even when underground
      const picks = viewer.scene.drillPick(event.position, 5);
      const picked = picks.find((p: { id?: unknown }) => defined(p.id) && (p.id as CesiumEntity).properties);
      if (!picked || !picked.id) {
        clearSelection();
        onWaypointClickRef.current?.(null);
        onFeatureClickRef.current?.(null);
        return null;
      }
      const entity = picked.id as CesiumEntity;
      const props = entity.properties;
      if (!props) {
        selectEntity(entity);
        return null;
      }
      const rawType = props.featureType?.getValue();
      const rawId = props.featureId?.getValue();
      const featureId = typeof rawId === "string" ? rawId : undefined;
      const featureType = isMapFeatureType(rawType) ? rawType : undefined;
      let feature: MapFeature | null = null;
      if (featureType && featureId) {
        feature = lookupFeature(
          airportRef.current,
          featureType,
          featureId,
          waypointsRef.current,
          takeoffCoordRef.current,
          landingCoordRef.current,
        );
        if (featureType === "waypoint") {
          onWaypointClickRef.current?.(featureId);
        }
        if (feature) onFeatureClickRef.current?.(feature);
      }
      selectEntity(entity);
      return feature;
    }

    handlerRef.current = new ScreenSpaceEventHandler(viewer.scene.canvas);
    // single-click: select only, never fly
    handlerRef.current.setInputAction(
      (event: { position: Cartesian2 }) => {
        pickAndSelect(event);
      },
      ScreenSpaceEventType.LEFT_CLICK,
    );

    // double-click: select AND fly to the picked entity
    handlerRef.current.setInputAction(
      (event: { position: Cartesian2 }) => {
        const feature = pickAndSelect(event);
        if (feature) {
          void flyCesiumToFeature(viewer, feature);
        }
      },
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );

    onViewerReady?.(viewer);

    // track camera heading for compass
    let lastBearing = -999;
    const bearingListener = () => {
      if (viewer.isDestroyed()) return;
      const headingRad = viewer.camera.heading;
      const bearingDeg = (360 - CesiumMath.toDegrees(headingRad)) % 360;
      const rounded = Math.round(bearingDeg * 10) / 10;
      if (rounded !== lastBearing) {
        lastBearing = rounded;
        onBearingChangeRef.current?.(bearingDeg);
      }
    };
    viewer.scene.postRender.addEventListener(bearingListener);

    return () => {
      clearSelection();
      if (!viewer.isDestroyed()) {
        viewer.scene.postRender.removeEventListener(bearingListener);
      }
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
    // one-shot init - airport/callbacks intentionally excluded via stable refs
  }, [initialized, selectEntity, clearSelection]);

  // sample terrain height at airport to compute ellipsoid-geoid offset for polylines.
  // polylines don't support heightReference so we need to convert MSL to ellipsoidal height.
  // re-samples on every tile load progress change so toggling layers later still works.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!initialized || !viewer || viewer.isDestroyed()) return;

    const [lng, lat] = airport.location.coordinates;
    const carto = Cartographic.fromDegrees(lng, lat);
    let resolved = false;

    function sample() {
      if (!viewer || viewer.isDestroyed()) return;
      const height = viewer.scene.globe.getHeight(carto);
      if (height != null && height > 0) {
        if (!resolved) {
          resolved = true;
          setTerrainOffset(height - (airport.elevation ?? 0));
        }
      }
    }

    // poll on each frame until resolved
    let cancelled = false;
    function poll() {
      if (cancelled || resolved) return;
      sample();
      requestAnimationFrame(poll);
    }
    poll();

    // also re-check whenever terrain tiles finish loading
    const removeListener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(
      (remaining: number) => {
        if (remaining === 0) sample();
      },
    );

    return () => {
      cancelled = true;
      removeListener();
    };
  }, [initialized, airport.location.coordinates, airport.elevation]);

  // switch imagery based on terrain mode
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let cancelled = false;
    const imageryLayers = viewer.imageryLayers;
    imageryLayers.removeAll();

    if (terrainMode === "satellite") {
      IonImageryProvider.fromAssetId(2)
        .then((provider) => {
          if (cancelled || viewer.isDestroyed()) return;
          imageryLayers.addImageryProvider(provider);
        })
        .catch((e) =>
          console.error("ion imagery failed:", e instanceof Error ? e.message : String(e)),
        );
    } else {
      const osmProvider = new UrlTemplateImageryProvider({
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maximumLevel: 19,
      });
      imageryLayers.addImageryProvider(osmProvider);
    }

    return () => {
      cancelled = true;
    };
  }, [terrainMode]);

  // highlight the focused feature. fly is a separate intent via locateRequest.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!initialized || !viewer || viewer.isDestroyed()) return;
    if (!focusFeature) {
      setSelectedFeatureKey(null);
      return;
    }
    setSelectedFeatureKey(`${focusFeature.type}:${focusFeature.data.id}`);
  }, [focusFeature, initialized]);

  // explicit locate intent: fly when key bumps.
  const lastLocateKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!initialized || !viewer || viewer.isDestroyed() || !locateRequest) return;
    if (lastLocateKeyRef.current === locateRequest.key) return;
    lastLocateKeyRef.current = locateRequest.key;
    setSelectedFeatureKey(`${locateRequest.feature.type}:${locateRequest.feature.data.id}`);
    void flyCesiumToFeature(viewer, locateRequest.feature);
  }, [locateRequest, initialized]);

  return (
    <Viewer
      ref={viewerRefCallback}
      full
      timeline={false}
      animation={false}
      homeButton={false}
      geocoder={false}
      baseLayerPicker={false}
      fullscreenButton={false}
      navigationHelpButton={false}
      sceneModePicker={false}
      selectionIndicator={false}
      infoBox={false}
      vrButton={false}
    >
      <CesiumInfrastructure
        airport={airport}
        layers={layers}
        selectedFeatureKey={selectedFeatureKey}
      />
      {waypoints.length > 0 && (
        <CesiumTrajectory
          waypoints={waypoints}
          layers={layers}
          selectedWaypointId={selectedWaypointId}
          takeoffCoordinate={takeoffCoordinate}
          landingCoordinate={landingCoordinate}
          visibleInspectionIds={visibleInspectionIds}
          showSimplified={layers.simplifiedTrajectory}
          airportElevation={airport.elevation ?? 0}
          terrainOffset={terrainOffset}
          highlightedWaypointIds={highlightedWaypointIds}
        />
      )}
    </Viewer>
  );
}
