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
  validateMission,
  batchUpdateWaypoints,
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
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import InspectionSelect from "@/components/map/overlays/InspectionSelect";
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
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // map state
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  // tools
  const { activeTool, is3D, setTool, resetTool } = useMapTools();
  const undoRedo = useUndoRedo<WaypointMoveAction>(10);
  const measure = useMeasureDistance();

  // dirty waypoint modifications - map from waypoint_id to new position/camera_target
  const [dirtyWaypoints, setDirtyWaypoints] = useState<
    Record<string, { position: PointZ; camera_target?: PointZ | null }>
  >({});

  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = Object.keys(dirtyWaypoints).length > 0;

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

  // filtered waypoints for selected inspection
  const visibleInspectionIds = useMemo(() => {
    if (!selectedInspectionId) {
      return mission ? new Set(mission.inspections.map((i) => i.id)) : new Set<string>();
    }
    return new Set([selectedInspectionId]);
  }, [selectedInspectionId, mission]);

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

      // re-read mission status - trajectory invalidation may regress status
      const fresh = await getMission(id);
      setMission(fresh);
      refreshMissions();
      setLastSaved(new Date());
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

  // validate trajectory button in tab nav
  const validateRef = useRef<() => void>(() => {});
  useEffect(() => {
    validateRef.current = handleValidate;
  });
  useEffect(() => {
    const canValidate =
      mission?.status === "PLANNED";
    setComputeContext({
      onCompute: () => validateRef.current(),
      canCompute: canValidate,
      isComputing: false,
      label: t("map.validateTrajectory"),
    });
    return () => {
      setComputeContext({
        onCompute: null,
        canCompute: false,
        isComputing: false,
      });
    };
  }, [setComputeContext, mission?.status, t]);

  // handle map click based on active tool
  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (activeTool === MapTool.ADD_START || activeTool === MapTool.ADD_END) {
        if (!id || !mission) return;
        const key =
          activeTool === MapTool.ADD_START
            ? "takeoff_coordinate"
            : "landing_coordinate";
        const existing =
          activeTool === MapTool.ADD_START
            ? mission.takeoff_coordinate
            : mission.landing_coordinate;
        const alt = existing ? existing.coordinates[2] : 0;

        updateMission(id, {
          [key]: {
            type: "Point" as const,
            coordinates: [lngLat.lng, lngLat.lat, alt],
          },
        }).then(() => {
          getMission(id).then((fresh) => {
            setMission(fresh);
            refreshMissions();
          });
        });
        return;
      }

      if (activeTool === MapTool.MEASURE) {
        measure.addPoint(lngLat.lng, lngLat.lat);
        return;
      }
    },
    [activeTool, id, mission, measure, refreshMissions],
  );

  // handle tool change
  const handleToolChange = useCallback(
    (tool: MapTool) => {
      if (tool === MapTool.ZOOM_RESET) {
        // handled by map - just fire it
        setTool(tool);
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

  // handle validate
  async function handleValidate() {
    if (!id || !mission) return;
    if (mission.status !== "PLANNED") return;

    try {
      await validateMission(id);
      const fresh = await getMission(id);
      setMission(fresh);
      refreshMissions();
      navigate(`/operator-center/missions/${id}/validation-export`);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        const detail = err.response?.data?.detail;
        showNotification(
          typeof detail === "string" ? detail : t("map.validateError"),
        );
      } else {
        showNotification(t("map.validateError"));
      }
    }
  }

  // ESC key handler - clear measure, reset tool
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeTool === MapTool.MEASURE) {
          measure.clear();
          resetTool();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, measure, resetTool]);

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

  const hasFlightPlan = flightPlan !== null;

  // determine if map click handler should be active
  const mapClickActive =
    activeTool === MapTool.ADD_START ||
    activeTool === MapTool.ADD_END ||
    activeTool === MapTool.MEASURE;

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
            leftPanelChildren={
              <>
                <InspectionSelect
                  inspections={mission.inspections}
                  selectedId={selectedInspectionId}
                  onSelect={setSelectedInspectionId}
                />
                {selectedInspectionId && (
                  <WaypointListPanel
                    waypoints={effectiveWaypoints}
                    selectedId={selectedWaypointId}
                    onSelect={setSelectedWaypointId}
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
              canUndo={undoRedo.canUndo}
              canRedo={undoRedo.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              inspectionSelected={selectedInspectionId !== null}
            />

            {/* right side overlays - leave room for maplibre nav control + bottom buttons */}
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

            {/* measure distance label */}
            {measure.distance !== null && measure.labelText && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
                {measure.labelText}
              </div>
            )}
          </AirportMap>

          {/* bottom-right controls */}
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2">
            <button
              onClick={() =>
                navigate(`/operator-center/missions/${id}/configuration`)
              }
              className="px-5 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="modify-parameters-btn"
            >
              {t("map.modifyParameters")}
            </button>
            <TerrainToggle
              mode={terrainMode}
              onToggle={setTerrainMode}
              inline
            />
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
