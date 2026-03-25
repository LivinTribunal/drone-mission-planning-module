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
import {
  getMission,
  updateMission,
  getFlightPlan,
  batchUpdateWaypoints,
  generateTrajectory,
} from "@/api/missions";
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
import LegendPanel from "@/components/map/overlays/LegendPanel";
import WaypointListPanel from "@/components/map/overlays/WaypointListPanel";
import PoiInfoPanel from "@/components/map/overlays/PoiInfoPanel";
import InspectionListPanel from "@/components/map/overlays/InspectionListPanel";
import MapControlsToolbar from "@/components/map/overlays/MapControlsToolbar";
import MapWarningsPanel from "@/components/map/overlays/MapWarningsPanel";
import MapStatsPanel from "@/components/map/overlays/MapStatsPanel";
import useMapTools, { MapTool } from "@/hooks/useMapTools";
import useUndoRedo from "@/hooks/useUndoRedo";
import useMeasureDistance from "@/hooks/useMeasureDistance";

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
  const { airportDetail } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions } =
    useOutletContext<MissionTabOutletContext>();

  // core data
  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [computing, setComputing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // map state
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  const [hiddenInspectionIds, setHiddenInspectionIds] = useState<Set<string>>(new Set());
  const [zoomPercent, setZoomPercent] = useState(100);

  // tools
  const { activeTool, is3D, setTool, resetTool, setIs3D } = useMapTools();
  const undoRedo = useUndoRedo<WaypointMoveAction>(10);
  const measure = useMeasureDistance();

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

      if (missionData.updated_at) {
        setLastSaved(new Date(missionData.updated_at));
      }

      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);
      } catch {
        setFlightPlan(null);
      }
    } catch {
      setError(t("mission.config.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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
        .filter((id) => !hiddenInspectionIds.has(id)),
    );
  }, [mission, hiddenInspectionIds]);

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
      undoRedo.clear();

      // re-read mission status
      const fresh = await getMission(id);
      setMission(fresh);
      refreshMissions();
      setLastSaved(new Date());
      showNotification(t("map.changesSaved"));
    } catch {
      showNotification(t("map.saveError"));
    } finally {
      setSaving(false);
    }
  }, [id, isDirty, dirtyWaypoints, undoRedo, t, refreshMissions]);

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

  // compute / recompute trajectory
  const handleCompute = useCallback(async () => {
    if (!id || !mission) return;
    setComputing(true);
    try {
      const result = await generateTrajectory(id);
      setFlightPlan(result.flight_plan);
      setDirtyWaypoints({});
      undoRedo.clear();

      const fresh = await getMission(id);
      setMission(fresh);
      refreshMissions();
      showNotification(t("map.changesSaved"));
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.detail) {
        const detail = err.response.data.detail;
        showNotification(typeof detail === "string" ? detail : t("mission.config.trajectoryError"));
      } else {
        showNotification(t("mission.config.trajectoryError"));
      }
    } finally {
      setComputing(false);
    }
  }, [id, mission, undoRedo, t, refreshMissions]);

  // compute button state
  const computeLabel = useMemo(() => {
    if (isDraft && !hasFlightPlan) return t("map.computeTrajectory");
    return t("map.recomputeTrajectory");
  }, [isDraft, hasFlightPlan, t]);

  const canCompute = useMemo(() => {
    if (isDraft && !hasFlightPlan) return true;
    if (mission?.has_unsaved_map_changes) return true;
    return false;
  }, [isDraft, hasFlightPlan, mission?.has_unsaved_map_changes]);

  // wire compute context to tab bar
  useEffect(() => {
    setComputeContext({
      onCompute: handleCompute,
      canCompute: canCompute && !computing,
      isComputing: computing,
      label: computeLabel,
    });
    return () => {
      setComputeContext({
        onCompute: null,
        canCompute: false,
        isComputing: false,
      });
    };
  }, [setComputeContext, handleCompute, canCompute, computing, computeLabel]);

  // handle map click based on active tool
  const handleMapClick = useCallback(
    async (lngLat: { lng: number; lat: number }) => {
      if (activeTool === MapTool.PLACE_TAKEOFF || activeTool === MapTool.PLACE_LANDING) {
        if (!id || !mission) return;
        const key =
          activeTool === MapTool.PLACE_TAKEOFF
            ? "takeoff_coordinate"
            : "landing_coordinate";
        const existing =
          activeTool === MapTool.PLACE_TAKEOFF
            ? mission.takeoff_coordinate
            : mission.landing_coordinate;
        const alt = existing ? existing.coordinates[2] : 0;

        resetTool();
        try {
          await updateMission(id, {
            [key]: {
              type: "Point" as const,
              coordinates: [lngLat.lng, lngLat.lat, alt],
            },
          });
          const fresh = await getMission(id);
          setMission(fresh);
          refreshMissions();
        } catch {
          showNotification(t("map.saveError"));
        }
        return;
      }

      if (activeTool === MapTool.MEASURE) {
        measure.addPoint(lngLat.lng, lngLat.lat);
        return;
      }

      if (activeTool === MapTool.ZOOM) {
        // zoom click handled by map natively, this is a fallback
        return;
      }
    },
    [activeTool, id, mission, measure, refreshMissions, resetTool],
  );

  // handle tool change
  const handleToolChange = useCallback(
    (tool: MapTool) => {
      if (tool === MapTool.ZOOM_RESET) {
        // handled by zoom reset callback
        return;
      }
      // clear measure when switching away
      if (activeTool === MapTool.MEASURE && tool !== MapTool.MEASURE) {
        measure.clear();
      }
      setTool(tool);
    },
    [activeTool, measure, setTool],
  );

  // handle undo
  const handleUndo = useCallback(() => {
    const action = undoRedo.undo();
    if (!action) return;
    setDirtyWaypoints((prev) => ({
      ...prev,
      [action.waypointId]: {
        position: action.oldPosition,
        camera_target: action.oldCameraTarget,
      },
    }));
  }, [undoRedo]);

  // handle redo
  const handleRedo = useCallback(() => {
    const action = undoRedo.redo();
    if (!action) return;
    setDirtyWaypoints((prev) => ({
      ...prev,
      [action.waypointId]: {
        position: action.newPosition,
        camera_target: action.newCameraTarget,
      },
    }));
  }, [undoRedo]);

  // handle feature click from map
  const handleFeatureClick = useCallback((feature: MapFeature) => {
    setSelectedFeature(feature);
  }, []);

  // clear waypoint selection when waypoint layers are hidden
  const handleLayerChange = useCallback((layers: MapLayerConfig) => {
    if (!layers.trajectory && !layers.transitWaypoints && !layers.measurementWaypoints) {
      setSelectedWaypointId(null);
      setSelectedFeature((prev) => prev?.type === "waypoint" ? null : prev);
    }
  }, []);

  // handle waypoint click - select waypoint and show as feature info
  const handleWaypointClick = useCallback(
    (wpId: string | null) => {
      setSelectedWaypointId(wpId);
      if (!wpId) return;
      const wp = effectiveWaypoints.find((w) => w.id === wpId);
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
          },
        });
      }
    },
    [effectiveWaypoints],
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
      } catch {
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

      undoRedo.push({
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
        },
      });
    },
    [effectiveWaypoints, undoRedo],
  );

  // place takeoff/landing
  const handlePlaceTakeoff = useCallback(() => {
    setTool(MapTool.PLACE_TAKEOFF);
  }, [setTool]);

  const handlePlaceLanding = useCallback(() => {
    setTool(MapTool.PLACE_LANDING);
  }, [setTool]);

  // zoom reset
  const handleZoomReset = useCallback(() => {
    // zoom reset is a no-op here - just a placeholder for the toolbar
    setZoomPercent(100);
  }, []);

  // zoom to specific percent
  const handleZoomTo = useCallback((percent: number) => {
    setZoomPercent(percent);
  }, []);

  // ESC key handler - clear measure, reset tool
  // Ctrl+Z / Ctrl+Shift+Z for undo/redo
  // Right-click to clear measurement
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        if (activeTool === MapTool.MEASURE) {
          measure.clear();
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

      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        handleZoomReset();
        return;
      }
    }

    function handleContextMenu(e: MouseEvent) {
      if (activeTool === MapTool.MEASURE && measure.hasPoints) {
        e.preventDefault();
        measure.clear();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeTool, measure, resetTool, handleUndo, handleRedo, handleZoomReset]);

  // beforeunload for dirty state
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
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
    activeTool === MapTool.MEASURE;

  const showPanels = !isDraft || hasFlightPlan;

  return (
    <div
      className="relative px-4 h-[calc(100vh-12rem)]"
      data-testid="mission-map-page"
    >
      {airportDetail ? (
        <div className="relative w-full h-full rounded-2xl overflow-hidden border border-tv-border">
          <AirportMap
            airport={airportDetail}
            terrainMode={terrainMode}
            onTerrainChange={setTerrainMode}
            showTerrainToggle={false}
            showLayerPanel={true}
            showLegend={false}
            showPoiInfo={false}
            showWaypointList={false}

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
            onLayerChange={handleLayerChange}
            activeTool={activeTool}
            onPlaceTakeoff={handlePlaceTakeoff}
            onPlaceLanding={handlePlaceLanding}
            measureData={measure.hasPoints ? {
              points: measure.pointsGeoJSON,
              lines: measure.linesGeoJSON,
              labels: measure.labelsGeoJSON,
            } : undefined}
            leftPanelChildren={
              <>
                {showPanels && mission.inspections.length > 0 && (
                  <InspectionListPanel
                    inspections={mission.inspections}
                    hiddenInspectionIds={hiddenInspectionIds}
                    onToggleVisibility={handleToggleInspectionVisibility}
                    onInspectionClick={handleInspectionClick}
                  />
                )}
                {showPanels && (
                  <WaypointListPanel
                    waypoints={effectiveWaypoints}
                    selectedId={selectedWaypointId}
                    onSelect={handleWaypointClick}
                    takeoffCoordinate={mission.takeoff_coordinate}
                    landingCoordinate={mission.landing_coordinate}
                    visibleInspectionIds={visibleInspectionIds}
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
              canUndo={undoRedo.canUndo}
              canRedo={undoRedo.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onZoomReset={handleZoomReset}
              zoomPercent={zoomPercent}
              onZoomTo={handleZoomTo}
            />

            {/* right side overlays */}
            <div
              className="absolute top-3 right-3 bottom-[200px] z-10 w-56 flex flex-col gap-2 overflow-y-auto"
              style={{ scrollbarGutter: "stable" }}
            >
              <LegendPanel
                missionStatus={mission.status}
                hasTakeoff={!!mission.takeoff_coordinate}
                hasLanding={!!mission.landing_coordinate}
                className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
              />

              {hasFlightPlan && violations.length > 0 && (
                <MapWarningsPanel violations={violations} />
              )}

              {hasFlightPlan && (
                <MapStatsPanel
                  flightPlan={flightPlan}
                  inspectionCount={mission.inspections.length}
                  enduranceMinutes={null}
                />
              )}
            </div>

          </AirportMap>

          {/* bottom bar */}
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* compute / recompute button */}
              <button
                onClick={handleCompute}
                disabled={!canCompute || computing}
                title={!canCompute && !isDraft ? t("map.noChangesToRecompute") : undefined}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                  computing
                    ? "bg-tv-accent/50 text-tv-accent-text cursor-not-allowed"
                    : canCompute
                      ? "bg-tv-success text-white hover:bg-tv-success/90"
                      : "bg-tv-surface text-tv-text-muted opacity-50 cursor-not-allowed border border-tv-border"
                }`}
                data-testid="compute-trajectory-btn"
              >
                {computing ? t("mission.config.computing") : computeLabel}
              </button>

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
            </div>

            {/* needs manual approval - right side */}
            {!isDraft && hasFlightPlan && (
              <button
                onClick={() =>
                  navigate(`/operator-center/missions/${id}/validation-export`)
                }
                className="px-5 py-2.5 rounded-full text-sm font-semibold border border-tv-error text-tv-error hover:bg-tv-error/10 transition-colors"
                data-testid="needs-approval-btn"
              >
                {t("map.needsManualApproval")}
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
