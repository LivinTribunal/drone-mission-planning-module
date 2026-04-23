import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { isAxiosError } from "@/api/client";
import { useAirport } from "@/contexts/AirportContext";
import { useComputation } from "@/contexts/ComputationContext";
import { useOnComputationCompleted } from "@/hooks/useOnComputationCompleted";
import {
  getMission,
  updateMission,
  getFlightPlan,
  batchUpdateWaypoints,
  insertTransitWaypoint,
  deleteTransitWaypoint,
} from "@/api/missions";
import { getDroneProfile } from "@/api/droneProfiles";
import type { MissionDetailResponse } from "@/types/mission";
import type {
  FlightPlanResponse,
  ValidationViolation,
  WaypointResponse,
  WaypointPositionUpdate,
} from "@/types/flightPlan";
import type { PointZ } from "@/types/common";
import type { MapFeature, MapLayerConfig } from "@/types/map";
import type { MissionTabOutletContext } from "@/components/Layout/MissionTabNav";
import AirportMap from "@/components/map/AirportMap";
import type { AirportMapHandle } from "@/components/map/AirportMap";
import LegendPanel from "@/components/map/overlays/LegendPanel";
import AirportInfoPanel from "@/components/map/overlays/AirportInfoPanel";
import WaypointListPanel from "@/components/map/overlays/WaypointListPanel";
import PoiInfoPanel from "@/components/map/overlays/PoiInfoPanel";
import InspectionListPanel from "@/components/map/overlays/InspectionListPanel";
import MapControlsToolbar from "@/components/map/overlays/MapControlsToolbar";
import MapWarningsPanel from "@/components/map/overlays/MapWarningsPanel";
import MapStatsPanel from "@/components/map/overlays/MapStatsPanel";
import useMapTools, { MapTool } from "@/hooks/useMapTools";
import useFlyAlong from "@/hooks/useFlyAlong";
import useUndoRedo from "@/hooks/useUndoRedo";
import useMeasureDistance from "@/hooks/useMeasureDistance";
import useHeadingTool from "@/hooks/useHeadingTool";
import MeasureInfoCard from "@/components/map/overlays/MeasureInfoCard";
import HeadingInfoCard from "@/components/map/overlays/HeadingInfoCard";
import {
  computePlacementUpdates,
  placementKeysFromUpdates,
} from "@/utils/takeoffLandingPlacement";

interface WaypointMoveAction {
  waypointId: string;
  oldPosition: PointZ;
  newPosition: PointZ;
  oldCameraTarget?: PointZ | null;
  newCameraTarget?: PointZ | null;
}

export default function MissionMapPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail, ensureAirport } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions, updateMissionFromPage, setCompactLeftPanel } =
    useOutletContext<MissionTabOutletContext>();
  const computation = useComputation();

  // hide left panel column - map uses full width
  useEffect(() => {
    setCompactLeftPanel(true);
    return () => setCompactLeftPanel(false);
  }, [setCompactLeftPanel]);

  // core data
  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [enduranceMinutes, setEnduranceMinutes] = useState<number | null>(null);

  // map state
  const mapHandleRef = useRef<AirportMapHandle>(null);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  const [hiddenInspectionIds, setHiddenInspectionIds] = useState<Set<string>>(new Set());
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [bearing, setBearing] = useState(0);
  const [bearingResetKey, setBearingResetKey] = useState(0);
  const [selectedWarning, setSelectedWarning] = useState<ValidationViolation | null>(null);

  // pending (optimistic) save state for takeoff/landing placement
  const [pendingPlacement, setPendingPlacement] = useState<Set<"takeoff" | "landing">>(new Set());

  // mirror mode is derived: true when takeoff and landing coordinates match
  const useTakeoffAsLanding = useMemo(() => {
    const t = mission?.takeoff_coordinate?.coordinates;
    const l = mission?.landing_coordinate?.coordinates;
    if (!t || !l) return false;
    return t[0] === l[0] && t[1] === l[1] && t[2] === l[2];
  }, [mission?.takeoff_coordinate, mission?.landing_coordinate]);

  // tools
  const { activeTool, is3D, setTool, resetTool, setIs3D } = useMapTools();
  const { state: flyAlongState, play: flyAlongPlay, pause: flyAlongPause, stop: flyAlongStop, setSpeed: flyAlongSetSpeed } = useFlyAlong(flightPlan?.waypoints?.length ?? 0);
  const {
    push: pushUndo,
    undo: undoFn,
    redo: redoFn,
    clear: clearHistory,
    canUndo,
    canRedo,
  } = useUndoRedo<WaypointMoveAction>(10);
  const measure = useMeasureDistance();
  const heading = useHeadingTool();

  // dirty waypoint modifications
  const [dirtyWaypoints, setDirtyWaypoints] = useState<
    Record<string, { position: PointZ; camera_target?: PointZ | null }>
  >({});

  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = Object.keys(dirtyWaypoints).length > 0;
  const isDraft = mission?.status === "DRAFT";
  const hasFlightPlan = flightPlan !== null;

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  function showNotification(msg: string) {
    setNotification(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  // fetch data
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const missionData = await getMission(id);
      setMission(missionData);

      // deep-linked nav: ensure the airport context matches the mission
      // regardless of whether the user picked one before landing here.
      ensureAirport(missionData.airport_id);

      if (missionData.updated_at) {
        setLastSaved(new Date(missionData.updated_at));
      }

      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);
      } catch (err) {
        if (!isAxiosError(err) || err.response?.status !== 404) throw err;
        setFlightPlan(null);
      }

      if (missionData.drone_profile_id) {
        try {
          const dp = await getDroneProfile(missionData.drone_profile_id);
          setEnduranceMinutes(dp.endurance_minutes);
        } catch (err) {
          console.error("drone profile fetch failed:", err instanceof Error ? err.message : String(err));
          setEnduranceMinutes(null);
        }
      }
    } catch (err) {
      console.error("mission load failed:", err instanceof Error ? err.message : String(err));
      setError(t("mission.config.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, t, ensureAirport]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // waypoints with dirty overrides applied
  const effectiveWaypoints = useMemo((): WaypointResponse[] => {
    if (!flightPlan) return [];
    return flightPlan.waypoints.map((wp) => {
      const dirty = dirtyWaypoints[wp.id];
      if (!dirty) return wp;
      return {
        ...wp,
        position: dirty.position,
        camera_target: dirty.camera_target !== undefined ? dirty.camera_target : wp.camera_target,
      };
    });
  }, [flightPlan, dirtyWaypoints]);

  // visible inspection ids - all non-hidden
  const visibleInspectionIds = useMemo(() => {
    if (!mission) return new Set<string>();
    return new Set(
      mission.inspections
        .map((i) => i.id)
        .filter((inspId) => !hiddenInspectionIds.has(inspId)),
    );
  }, [mission, hiddenInspectionIds]);

  // waypoints filtered by selected inspection
  const filteredWaypoints = useMemo((): WaypointResponse[] => {
    if (!selectedInspectionId) return effectiveWaypoints;
    return effectiveWaypoints.filter(
      (wp) => wp.inspection_id === selectedInspectionId,
    );
  }, [effectiveWaypoints, selectedInspectionId]);

  // inspection index map
  const inspectionIndexMap = useMemo(() => {
    if (!mission) return undefined;
    const sorted = [...mission.inspections].sort((a, b) => a.sequence_order - b.sequence_order);
    return Object.fromEntries(sorted.map((insp, i) => [insp.id, i + 1]));
  }, [mission]);

  const violations = useMemo((): ValidationViolation[] => {
    return flightPlan?.validation_result?.violations ?? [];
  }, [flightPlan]);

  // handle save - batch update waypoints
  const handleSave = useCallback(async () => {
    if (!id || !isDirty) return;
    setSaving(true);
    try {
      const updates: WaypointPositionUpdate[] = Object.entries(dirtyWaypoints).map(
        ([waypointId, data]) => ({
          waypoint_id: waypointId,
          position: data.position,
          ...(data.camera_target !== undefined ? { camera_target: data.camera_target } : {}),
        }),
      );
      const updatedFp = await batchUpdateWaypoints(id, updates);
      setFlightPlan(updatedFp);
      setDirtyWaypoints({});
      clearHistory();

      // re-read mission status
      const fresh = await getMission(id);
      setMission(fresh);
      updateMissionFromPage(fresh);
      refreshMissions();
      setLastSaved(new Date());
      showNotification(t("map.changesSaved"));
    } catch (err) {
      console.error("map save error:", err instanceof Error ? err.message : String(err));
      showNotification(t("map.saveError"));
    } finally {
      setSaving(false);
    }
  }, [id, isDirty, dirtyWaypoints, clearHistory, t, refreshMissions, updateMissionFromPage]);

  // wire save context
  useEffect(() => {
    setSaveContext({
      onSave: handleSave,
      isDirty,
      isSaving: saving,
      lastSaved,
    });
    return () => {
      setSaveContext({
        onSave: null,
        isDirty: false,
        isSaving: false,
        lastSaved: null,
      });
    };
  }, [setSaveContext, handleSave, isDirty, saving, lastSaved]);

  useOnComputationCompleted((result) => {
    setFlightPlan(result);
    setDirtyWaypoints({});
    clearHistory();

    if (id) {
      getMission(id)
        .then((fresh) => {
          setMission(fresh);
          updateMissionFromPage(fresh);
          refreshMissions();
        })
        .catch((err) => console.warn("mission refresh failed", err));
    }
  });

  // compute button state
  const computeLabel = useMemo(() => {
    if (!hasFlightPlan) return t("map.computeTrajectory");
    return t("map.recomputeTrajectory");
  }, [hasFlightPlan, t]);

  const hasCoordinates = !!(mission?.takeoff_coordinate && mission?.landing_coordinate);

  const canCompute = useMemo(() => {
    if (!hasCoordinates) return false;
    if (!hasFlightPlan) return true;
    if (isDirty || mission?.has_unsaved_map_changes) return true;
    return false;
  }, [hasFlightPlan, isDirty, mission?.has_unsaved_map_changes, hasCoordinates]);

  // wire compute context to tab bar - "Compute / Recompute Trajectory" button
  useEffect(() => {
    setComputeContext({
      onCompute: id ? () => computation.startComputation(id) : null,
      canCompute: canCompute && !computation.isComputing,
      isComputing: computation.isComputing,
      label: computeLabel,
      ...(!hasCoordinates ? { tooltip: t("mission.config.setCoordinatesTooltip") } : {}),
    });
    return () => {
      setComputeContext({
        onCompute: null,
        canCompute: false,
        isComputing: false,
      });
    };
  }, [setComputeContext, computation.isComputing, computation.startComputation, canCompute, computeLabel, hasCoordinates, t, id]);

  // handle map click based on active tool
  const handleMapClick = useCallback(
    async (lngLat: { lng: number; lat: number }) => {
      if (activeTool === MapTool.PLACE_TAKEOFF || activeTool === MapTool.PLACE_LANDING) {
        if (!id || !mission) return;
        const updates = computePlacementUpdates(
          activeTool,
          lngLat,
          mission,
          airportDetail?.elevation,
          useTakeoffAsLanding,
        );
        if (!updates) return;

        const pendingKeys = new Set<"takeoff" | "landing">(
          placementKeysFromUpdates(updates),
        );
        setPendingPlacement((prev) => new Set([...prev, ...pendingKeys]));

        resetTool();
        try {
          await updateMission(id, updates);
          const fresh = await getMission(id);
          setMission(fresh);
          refreshMissions();
        } catch (err) {
          console.error("map save error:", err instanceof Error ? err.message : String(err));
          showNotification(t("map.saveError"));
        } finally {
          setPendingPlacement((prev) => {
            const next = new Set(prev);
            for (const k of pendingKeys) next.delete(k);
            return next;
          });
        }
        return;
      }

      if (activeTool === MapTool.MEASURE && (measure.isDrawing || !measure.hasPoints)) {
        measure.addPoint(lngLat.lng, lngLat.lat);
        return;
      }

      if (activeTool === MapTool.HEADING) {
        heading.addPoint(lngLat.lng, lngLat.lat);
        return;
      }

      if (activeTool === MapTool.ZOOM) {
        // zoom click handled by map natively, this is a fallback
        return;
      }
    },
    [activeTool, id, mission, measure, heading, refreshMissions, resetTool, t, airportDetail, useTakeoffAsLanding],
  );

  // handle tool change
  const handleToolChange = useCallback(
    (tool: MapTool) => {
      if (tool === MapTool.ZOOM_RESET) {
        // handled by zoom reset callback
        return;
      }
      // dismiss measure when switching away
      if (activeTool === MapTool.MEASURE && tool !== MapTool.MEASURE) {
        measure.dismiss();
      }
      // dismiss heading when switching away
      if (activeTool === MapTool.HEADING && tool !== MapTool.HEADING) {
        heading.dismiss();
      }
      setTool(tool);
    },
    [activeTool, measure, heading, setTool],
  );

  // handle undo
  const handleUndo = useCallback(() => {
    const action = undoFn();
    if (!action) return;
    setDirtyWaypoints((prev) => ({
      ...prev,
      [action.waypointId]: {
        position: action.oldPosition,
        camera_target: action.oldCameraTarget,
      },
    }));
  }, [undoFn]);

  // handle redo
  const handleRedo = useCallback(() => {
    const action = redoFn();
    if (!action) return;
    setDirtyWaypoints((prev) => ({
      ...prev,
      [action.waypointId]: {
        position: action.newPosition,
        camera_target: action.newCameraTarget,
      },
    }));
  }, [redoFn]);

  // handle feature click from map
  const handleFeatureClick = useCallback((feature: MapFeature | null) => {
    setSelectedFeature(feature);
  }, []);

  // clear waypoint selection when waypoint layers are hidden
  const handleLayerChange = useCallback((layers: MapLayerConfig) => {
    if (!layers.trajectory && !layers.transitWaypoints && !layers.measurementWaypoints) {
      setSelectedWaypointId(null);
      setSelectedFeature((prev) => prev?.type === "waypoint" ? null : prev);
    }
  }, []);

  // build a MapFeature for a waypoint id (including standalone takeoff/landing).
  // shared by click (select-only) and locate (select + recenter) paths.
  const buildWaypointFeatureFromId = useCallback(
    (wpId: string): MapFeature | null => {
      if (wpId === "takeoff" && mission?.takeoff_coordinate) {
        const [lon, lat, alt] = mission.takeoff_coordinate.coordinates;
        return {
          type: "waypoint",
          data: {
            id: "takeoff",
            waypoint_type: "TAKEOFF",
            sequence_order: 0,
            position: { type: "Point", coordinates: [lon, lat, alt] },
            stack_count: 1,
          },
        };
      }
      if (wpId === "landing" && mission?.landing_coordinate) {
        const [lon, lat, alt] = mission.landing_coordinate.coordinates;
        return {
          type: "waypoint",
          data: {
            id: "landing",
            waypoint_type: "LANDING",
            sequence_order: 0,
            position: { type: "Point", coordinates: [lon, lat, alt] },
            stack_count: 1,
          },
        };
      }
      const wp = effectiveWaypoints.find((w) => w.id === wpId);
      if (!wp) return null;
      const [lon, lat, alt] = wp.position.coordinates;
      return {
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
        },
      };
    },
    [effectiveWaypoints, mission],
  );

  // handle waypoint click - select waypoint and show as feature info
  const handleWaypointClick = useCallback(
    (wpId: string | null) => {
      setSelectedWaypointId(wpId);
      if (!wpId) {
        setSelectedFeature(null);
        return;
      }
      const feature = buildWaypointFeatureFromId(wpId);
      if (feature) setSelectedFeature(feature);
    },
    [buildWaypointFeatureFromId],
  );

  // double-click on a waypoint row in the side panel: select + recenter the map.
  // routes through the AirportMap imperative handle, which picks 2d vs cesium.
  const handleWaypointLocate = useCallback(
    (wpId: string) => {
      const feature = buildWaypointFeatureFromId(wpId);
      if (!feature) return;
      setSelectedWaypointId(wpId);
      setSelectedFeature(feature);
      mapHandleRef.current?.locateFeature(feature);
    },
    [buildWaypointFeatureFromId],
  );

  // handle inspection toggle visibility
  const handleToggleInspectionVisibility = useCallback((inspId: string) => {
    setHiddenInspectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(inspId)) {
        next.delete(inspId);
      } else {
        next.add(inspId);
      }
      return next;
    });
  }, []);

  // handle inspection selection - click to select, click again to deselect
  const handleInspectionSelect = useCallback((inspId: string) => {
    setSelectedInspectionId((prev) => (prev === inspId ? null : inspId));
  }, []);

  // handle inspection click - scroll to waypoints
  const handleInspectionClick = useCallback(
    (inspId: string) => {
      // make visible if hidden
      if (hiddenInspectionIds.has(inspId)) {
        setHiddenInspectionIds((prev) => {
          const next = new Set(prev);
          next.delete(inspId);
          return next;
        });
      }
    },
    [hiddenInspectionIds],
  );

  // handle delete takeoff/landing
  const handleDeleteTakeoffLanding = useCallback(
    async (waypointType: string) => {
      if (!id || !mission) return;
      const key = waypointType === "TAKEOFF" ? "takeoff_coordinate" : "landing_coordinate";
      try {
        await updateMission(id, { [key]: null });
        const fresh = await getMission(id);
        setMission(fresh);
        refreshMissions();
        setSelectedFeature(null);
        setSelectedWaypointId(null);
      } catch (err) {
        console.error("map save error:", err instanceof Error ? err.message : String(err));
        showNotification(t("map.saveError"));
      }
    },
    [id, mission, t, refreshMissions],
  );

  // handle coordinate edit from PoiInfoPanel
  const handleCoordinateChange = useCallback(
    (waypointId: string, lat: number, lon: number, alt: number) => {
      const wp = effectiveWaypoints.find((w) => w.id === waypointId);
      if (!wp) return;

      const newPosition: PointZ = {
        type: "Point",
        coordinates: [lon, lat, alt],
      };

      pushUndo({
        waypointId,
        oldPosition: wp.position,
        newPosition,
      });

      setDirtyWaypoints((prev) => ({
        ...prev,
        [waypointId]: { position: newPosition },
      }));

      // update feature info
      setSelectedFeature({
        type: "waypoint",
        data: {
          id: wp.id,
          waypoint_type: wp.waypoint_type,
          sequence_order: wp.sequence_order,
          position: newPosition,
          stack_count: 1,
          heading: wp.heading ?? null,
          speed: wp.speed ?? null,
          camera_action: wp.camera_action ?? null,
          camera_target: wp.camera_target ?? null,
          gimbal_pitch: wp.gimbal_pitch ?? null,
        },
      });
    },
    [effectiveWaypoints, pushUndo],
  );

  // place takeoff/landing
  const handlePlaceTakeoff = useCallback(() => {
    setTool(MapTool.PLACE_TAKEOFF);
  }, [setTool]);

  const handlePlaceLanding = useCallback(() => {
    setTool(MapTool.PLACE_LANDING);
  }, [setTool]);

  // zoom reset - not yet wired to map API
  const handleZoomReset = useCallback(() => {}, []);

  // zoom to specific percent
  const handleZoomTo = useCallback((percent: number) => {
    setZoomPercent(percent);
  }, []);

  // handle waypoint drag from map
  const handleWaypointDrag = useCallback(
    async (wpId: string, newPos: [number, number, number]) => {
      // standalone T/L markers - persist directly as mission coordinate update
      if (wpId === "takeoff" || wpId === "landing") {
        if (!id) return;
        const newCoord: PointZ = { type: "Point", coordinates: newPos };
        const updates: Record<string, PointZ> =
          wpId === "takeoff"
            ? { takeoff_coordinate: newCoord }
            : { landing_coordinate: newCoord };

        // mirror takeoff to landing for round-trip missions
        if (wpId === "takeoff" && useTakeoffAsLanding) {
          updates.landing_coordinate = {
            type: "Point",
            coordinates: [...newPos] as [number, number, number],
          };
        }

        try {
          await updateMission(id, updates);
          const fresh = await getMission(id);
          setMission(fresh);
          refreshMissions();
        } catch (err) {
          console.error("T/L drag save error:", err instanceof Error ? err.message : String(err));
          showNotification(t("map.saveError"));
        }
        return;
      }

      const wp = effectiveWaypoints.find((w) => w.id === wpId);
      if (!wp) return;
      const newPosition: PointZ = { type: "Point", coordinates: newPos };
      pushUndo({
        waypointId: wpId,
        oldPosition: wp.position,
        newPosition,
      });
      setDirtyWaypoints((prev) => ({
        ...prev,
        [wpId]: { position: newPosition },
      }));
    },
    [effectiveWaypoints, pushUndo, id, useTakeoffAsLanding, refreshMissions, t],
  );

  // handle transit waypoint insertion from map click on transit path
  const handleTransitInsert = useCallback(
    async (position: [number, number, number], afterSequence: number) => {
      if (!id) return;
      try {
        const updatedFp = await insertTransitWaypoint(
          id,
          { type: "Point", coordinates: position },
          afterSequence,
        );
        setFlightPlan(updatedFp);
        setDirtyWaypoints({});
        clearHistory();
        const fresh = await getMission(id);
        setMission(fresh);
        updateMissionFromPage(fresh);
        refreshMissions();
        showNotification(t("map.insertTransit"));
      } catch (err) {
        console.error("transit insert error:", err instanceof Error ? err.message : String(err));
        showNotification(t("map.saveError"));
      }
    },
    [id, clearHistory, t, refreshMissions, updateMissionFromPage],
  );

  // handle transit waypoint deletion from double-click
  const handleTransitDelete = useCallback(
    async (waypointId: string) => {
      if (!id) return;
      try {
        const updatedFp = await deleteTransitWaypoint(id, waypointId);
        setFlightPlan(updatedFp);
        setDirtyWaypoints({});
        clearHistory();
        const fresh = await getMission(id);
        setMission(fresh);
        updateMissionFromPage(fresh);
        refreshMissions();
        showNotification(t("map.deleteTransit"));
      } catch (err) {
        console.error("transit delete error:", err instanceof Error ? err.message : String(err));
        showNotification(t("map.saveError"));
      }
    },
    [id, clearHistory, t, refreshMissions, updateMissionFromPage],
  );

  // ESC key handler - clear measure, reset tool
  // Ctrl+Z / Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        if (measure.isComplete) {
          measure.dismiss();
          return;
        }
        if (heading.isComplete) {
          heading.dismiss();
          return;
        }
        if (activeTool === MapTool.MEASURE) {
          measure.clear();
        }
        if (activeTool === MapTool.HEADING) {
          heading.clear();
        }
        resetTool();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }

    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool, measure, heading, resetTool, handleUndo, handleRedo]);

  // beforeunload for dirty state
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-tv-error">{error ?? t("common.error")}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  // determine if map click handler should be active
  const mapClickActive =
    activeTool === MapTool.PLACE_TAKEOFF ||
    activeTool === MapTool.PLACE_LANDING ||
    activeTool === MapTool.MEASURE ||
    activeTool === MapTool.HEADING;

  const hasTakeoffOrLanding = !!(mission?.takeoff_coordinate || mission?.landing_coordinate);
  const showPanels = !isDraft || hasFlightPlan || hasTakeoffOrLanding;

  return (
    <div
      className="relative px-4 h-full"
      data-testid="mission-map-page"
    >
      {airportDetail ? (
        <div className="relative w-full h-full rounded-2xl overflow-hidden border border-tv-border">
          <AirportMap
            ref={mapHandleRef}
            airport={airportDetail}
            terrainMode={terrainMode}
            onTerrainChange={setTerrainMode}
            is3D={is3D}
            showTerrainToggle={false}
            showLayerPanel={true}
            showLegend={false}
            showPoiInfo={false}
            showWaypointList={false}
            showZoomControls={false}
            showCompass={false}
            onBearingChange={setBearing}
            bearingResetKey={bearingResetKey}

            waypoints={effectiveWaypoints}
            selectedWaypointId={selectedWaypointId}
            onWaypointClick={handleWaypointClick}
            missionStatus={mission.status}
            onMapClick={mapClickActive ? handleMapClick : undefined}
            takeoffCoordinate={mission.takeoff_coordinate}
            landingCoordinate={mission.landing_coordinate}
            inspectionIndexMap={inspectionIndexMap}
            visibleInspectionIds={visibleInspectionIds}
            onFeatureClick={handleFeatureClick}
            focusFeature={selectedFeature}
            onLayerChange={handleLayerChange}
            activeTool={activeTool}
            onPlaceTakeoff={handlePlaceTakeoff}
            onPlaceLanding={useTakeoffAsLanding ? undefined : handlePlaceLanding}
            measureData={{
              points: measure.pointsGeoJSON,
              lines: measure.linesGeoJSON,
              labels: measure.labelsGeoJSON,
            }}
            onMeasureClear={measure.clear}
            onMeasureFinish={measure.finishDrawing}
            onMeasureMouseMove={measure.setCursor}
            isMeasureDrawing={measure.isDrawing}
            headingData={{
              point: heading.pointGeoJSON,
              line: heading.lineGeoJSON,
              label: heading.labelGeoJSON,
            }}
            onHeadingClear={heading.clear}
            headingOrigin={heading.origin}
            isHeadingDrawing={heading.isDrawing}
            onWaypointDrag={handleWaypointDrag}
            onTransitInsert={handleTransitInsert}
            onTransitDelete={handleTransitDelete}
            zoomPercent={zoomPercent}
            onZoomChange={setZoomPercent}
            highlightedWaypointIds={selectedWarning?.waypoint_ids}
            highlightSeverity={selectedWarning?.severity}
            selectedWarning={selectedWarning}
            onWarningClose={() => setSelectedWarning(null)}
            useTakeoffAsLanding={useTakeoffAsLanding}
            leftPanelChildren={
              <>
                {pendingPlacement.size > 0 && (
                  <div
                    className="flex items-center justify-between rounded-2xl border border-tv-warning bg-tv-bg px-3 py-1.5 text-xs font-semibold text-tv-warning"
                    data-testid="pending-placement-indicator"
                  >
                    <span>{t("map.markerUnsaved")}</span>
                    <span>
                      {Array.from(pendingPlacement)
                        .map((k) =>
                          k === "takeoff"
                            ? t("map.placeTakeoff")
                            : t("map.placeLanding"),
                        )
                        .join(", ")}
                    </span>
                  </div>
                )}
                {showPanels && mission.inspections.length > 0 && (
                  <InspectionListPanel
                    inspections={mission.inspections}
                    hiddenInspectionIds={hiddenInspectionIds}
                    onToggleVisibility={handleToggleInspectionVisibility}
                    onInspectionClick={handleInspectionClick}
                    selectedId={selectedInspectionId}
                    onSelect={handleInspectionSelect}
                  />
                )}
                {showPanels && (
                  <WaypointListPanel
                    waypoints={filteredWaypoints}
                    selectedId={selectedWaypointId}
                    onSelect={handleWaypointClick}
                    onLocate={handleWaypointLocate}
                    takeoffCoordinate={selectedInspectionId ? null : mission.takeoff_coordinate}
                    landingCoordinate={selectedInspectionId ? null : mission.landing_coordinate}
                    visibleInspectionIds={visibleInspectionIds}
                  />
                )}
                {measure.isComplete && (
                  <MeasureInfoCard
                    totalDistance={measure.totalDistance}
                    segmentCount={measure.segments.length}
                    onClose={measure.dismiss}
                  />
                )}
                {heading.isComplete && (
                  <HeadingInfoCard
                    bearing={heading.bearing ?? 0}
                    onClose={heading.dismiss}
                  />
                )}
                {selectedFeature && (
                  <PoiInfoPanel
                    feature={selectedFeature}
                    onClose={() => {
                      setSelectedFeature(null);
                      setSelectedWaypointId(null);
                    }}
                    editable={true}
                    onCoordinateChange={handleCoordinateChange}
                    onDeleteTakeoffLanding={handleDeleteTakeoffLanding}
                  />
                )}
              </>
            }
          >
            {/* map controls toolbar - top center */}
            <MapControlsToolbar
              activeTool={activeTool}
              onToolChange={handleToolChange}
              is3D={is3D}
              onToggle3D={setIs3D}
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onZoomReset={handleZoomReset}
              zoomPercent={zoomPercent}
              onZoomTo={handleZoomTo}
              bearing={bearing}
              onBearingReset={() => setBearingResetKey((k) => k + 1)}
              hasTrajectory={!!flightPlan?.waypoints?.length}
              flyAlongState={flyAlongState}
              onFlyAlongPlay={flyAlongPlay}
              onFlyAlongPause={flyAlongPause}
              onFlyAlongStop={flyAlongStop}
              onFlyAlongSpeedChange={flyAlongSetSpeed}
            />

            {/* right side overlays */}
            <div
              className="absolute top-3 right-3 bottom-[60px] z-10 w-56 flex flex-col gap-2 overflow-y-auto pr-1"
              style={{ scrollbarGutter: "stable" }}
            >
              <LegendPanel
                missionStatus={mission.status}
                hasTakeoff={!!mission.takeoff_coordinate}
                hasLanding={!!mission.landing_coordinate}
                className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
              />

              {airportDetail && (
                <AirportInfoPanel
                  airport={airportDetail}
                  className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
                />
              )}

              {hasFlightPlan && violations.length > 0 && (
                <MapWarningsPanel
                  violations={violations}
                  onWarningClick={setSelectedWarning}
                  selectedWarningId={selectedWarning?.id}
                />
              )}

              {hasFlightPlan && (
                <MapStatsPanel
                  flightPlan={flightPlan}
                  inspectionCount={mission.inspections.length}
                  enduranceMinutes={enduranceMinutes}
                />
              )}
            </div>

          </AirportMap>

          {/* bottom bar - right-aligned under right panel edge */}
          <div className="absolute bottom-3 z-10 flex items-center gap-2" style={{ right: "32px" }}>
            {/* modify parameters */}
            <button
              onClick={() =>
                navigate(`/operator-center/missions/${id}/configuration`)
              }
              className="px-5 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="modify-parameters-btn"
            >
              {t("map.modifyParameters")}
            </button>

            {/* TODO: replace navigation with a validate-only API call once the backend endpoint exists */}
            {hasFlightPlan && (
              <button
                onClick={() => navigate(`/operator-center/missions/${id}/validation-export`)}
                disabled={isDirty || !!mission?.has_unsaved_map_changes}
                title={isDirty || mission?.has_unsaved_map_changes ? t("map.recomputeBeforeValidating") : undefined}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors border-2 ${
                  isDirty || mission?.has_unsaved_map_changes
                    ? "border-tv-border bg-tv-surface text-tv-text-muted opacity-50 cursor-not-allowed"
                    : "border-tv-success bg-tv-surface text-tv-success hover:bg-tv-success/10"
                }`}
                data-testid="validate-trajectory-btn"
              >
                {t("map.validateTrajectory")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-2xl border border-tv-border h-full">
          <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
        </div>
      )}

      {/* notification toast */}
      {notification && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-tv-surface border border-tv-border text-sm text-tv-text-primary"
          data-testid="notification-toast"
        >
          {notification}
        </div>
      )}
    </div>
  );
}
