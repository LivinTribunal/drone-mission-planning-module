import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "@/api/client";
import { Loader2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import {
  getMission,
  updateMission,
  addInspection,
  updateInspection,
  removeInspection,
  reorderInspections,
  generateTrajectory,
  getFlightPlan,
} from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";
import { listInspectionTemplates } from "@/api/inspectionTemplates";
import type {
  MissionDetailResponse,
  MissionUpdate,
  InspectionConfigOverride,
} from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { FlightPlanResponse, ValidationViolation } from "@/types/flightPlan";
import type { InspectionMethod } from "@/types/enums";
import type { MissionTabOutletContext } from "@/components/Layout/MissionTabNav";
import InspectionList from "@/components/mission/InspectionList";
import TemplatePicker from "@/components/mission/TemplatePicker";
import MissionConfigForm from "@/components/mission/MissionConfigForm";
import InspectionConfigForm from "@/components/mission/InspectionConfigForm";
import WarningsPanel from "@/components/mission/WarningsPanel";
import StatsPanel from "@/components/mission/StatsPanel";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import Modal from "@/components/common/Modal";

const STATUS_ORDER = [
  "DRAFT",
  "PLANNED",
  "VALIDATED",
  "EXPORTED",
  "COMPLETED",
  "CANCELLED",
];

const TERMINAL_STATUSES = ["EXPORTED", "COMPLETED", "CANCELLED"];

export default function MissionConfigPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions } =
    useOutletContext<MissionTabOutletContext>();

  // core data
  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>(
    [],
  );
  const [templates, setTemplates] = useState<InspectionTemplateResponse[]>([]);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [warnings, setWarnings] = useState<ValidationViolation[] | null>(null);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<
    string | null
  >(null);
  const [visibleInspectionIds, setVisibleInspectionIds] = useState<Set<string>>(
    new Set(),
  );
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null,
  );

  // terrain mode lifted from map for bottom bar toggle
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">(
    "satellite",
  );
  const [is3D, setIs3D] = useState(false);

  // coordinate pick-on-map mode
  const [pickingCoord, setPickingCoord] = useState<"takeoff" | "landing" | null>(null);

  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // dirty tracking for mission-level changes
  const [missionDirty, setMissionDirty] = useState<Partial<MissionUpdate>>({});
  // dirty tracking for inspection-level config overrides
  const [inspectionDirty, setInspectionDirty] = useState<
    Record<string, InspectionConfigOverride>
  >({});

  // unsaved changes dialog
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // lha selection per inspection
  const [selectedLhas, setSelectedLhas] = useState<Record<string, Set<string>>>(
    {},
  );

  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectionDirtyRef = useRef(inspectionDirty);
  inspectionDirtyRef.current = inspectionDirty;

  const isDraft = mission?.status === "DRAFT";
  const canModify = mission
    ? !TERMINAL_STATUSES.includes(mission.status)
    : false;

  const computeRef = useRef<() => void>(() => {});

  const isDirty =
    Object.keys(missionDirty).length > 0 ||
    Object.keys(inspectionDirty).length > 0;

  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates],
  );

  // all AGLs from airport
  const allAgls = useMemo(() => {
    if (!airportDetail) return [];
    return airportDetail.surfaces.flatMap((s) => s.agls);
  }, [airportDetail]);

  // selected drone profile
  const selectedDroneProfile = useMemo(() => {
    const dpId = missionDirty.drone_profile_id ?? mission?.drone_profile_id;
    return droneProfiles.find((dp) => dp.id === dpId) ?? null;
  }, [droneProfiles, missionDirty, mission]);


  // cleanup notification timer on unmount
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

  function updateMissionState(fresh: MissionDetailResponse, previousStatus?: string) {
    /** update local mission state, detect regression, and refresh nav. */
    if (previousStatus) {
      const oldIdx = STATUS_ORDER.indexOf(previousStatus);
      const newIdx = STATUS_ORDER.indexOf(fresh.status);
      if (newIdx < oldIdx) {
        // status regressed - keep stale flight plan visible with warning
        showNotification(
          t("mission.config.statusRegressed", { status: fresh.status }),
        );
      }
    }
    setMission(fresh);
    refreshMissions();
  }

  // fetch mission data
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [missionData, dpData, tplData] = await Promise.all([
        getMission(id),
        listDroneProfiles(),
        listInspectionTemplates(
          airportDetail ? { airport_id: airportDetail.id } : undefined,
        ),
      ]);
      setMission(missionData);
      setDroneProfiles(dpData.data);
      setTemplates(tplData.data);

      // initialize last saved from db timestamp
      if (missionData.updated_at) {
        setLastSaved(new Date(missionData.updated_at));
      } else if (missionData.created_at) {
        setLastSaved(new Date(missionData.created_at));
      }

      // set all inspections visible by default
      setVisibleInspectionIds(
        new Set(missionData.inspections.map((i) => i.id)),
      );

      // restore LHA selections - prefer dirty (unsaved) over backend
      const lhaInit: Record<string, Set<string>> = {};
      const currentDirty = inspectionDirtyRef.current;
      for (const insp of missionData.inspections) {
        const dirtyIds = currentDirty[insp.id]?.lha_ids;
        if (dirtyIds && dirtyIds.length > 0) {
          lhaInit[insp.id] = new Set(dirtyIds);
        } else if (insp.lha_ids && insp.lha_ids.length > 0) {
          lhaInit[insp.id] = new Set(insp.lha_ids);
        }
      }
      setSelectedLhas((prev) => ({ ...prev, ...lhaInit }));

      // fetch existing flight plan
      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);

        // load warnings from existing flight plan
        if (fp.validation_result?.violations?.length) {
          setWarnings(fp.validation_result.violations);
        }
      } catch {
        setFlightPlan(null);
      }
    } catch {
      setError(t("mission.config.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, airportDetail, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // handle save
  const handleSave = useCallback(async () => {
    if (!id || !mission) return;
    setSaving(true);
    const previousStatus = mission.status;

    try {
      // save mission-level changes
      if (Object.keys(missionDirty).length > 0) {
        await updateMission(id, missionDirty);
        setMissionDirty({});
      }

      // save inspection-level changes
      const failedInspections: Record<string, InspectionConfigOverride> = {};
      for (const [inspId, override] of Object.entries(inspectionDirty)) {
        try {
          await updateInspection(id, inspId, { config: override });
        } catch {
          failedInspections[inspId] = override;
        }
      }
      setInspectionDirty(failedInspections);

      if (Object.keys(failedInspections).length > 0) {
        showNotification(t("mission.config.savePartialError"));
        return;
      }

      // re-fetch mission after all saves to detect status regression
      const fresh = await getMission(id);
      updateMissionState(fresh, previousStatus);

      setLastSaved(new Date());

      // only show "saved" if no regression notification was already shown
      const oldIdx = STATUS_ORDER.indexOf(previousStatus);
      const newIdx = STATUS_ORDER.indexOf(fresh.status);
      if (newIdx >= oldIdx) {
        showNotification(t("mission.config.saved"));
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("mission.config.saveError");
      showNotification(msg);
    } finally {
      setSaving(false);
    }
  }, [id, mission, missionDirty, inspectionDirty, t]);

  // wire up save context to tab nav
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

  // wire up compute context to tab nav
  useEffect(() => {
    computeRef.current = handleComputeTrajectory;
  });

  useEffect(() => {
    setComputeContext({
      onCompute: () => computeRef.current(),
      canCompute: isDraft,
      isComputing: computing,
    });

    return () => {
      setComputeContext({
        onCompute: null,
        canCompute: false,
        isComputing: false,
      });
    };
  }, [setComputeContext, isDraft, computing]);

  // unsaved changes on beforeunload
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // handlers
  function handleMissionChange(update: Partial<MissionUpdate>) {
    setMissionDirty((prev) => ({ ...prev, ...update }));
  }

  function handleInspectionConfigChange(override: InspectionConfigOverride) {
    if (!selectedInspectionId) return;
    setInspectionDirty((prev) => ({
      ...prev,
      [selectedInspectionId]: override,
    }));
  }

  function handleToggleLha(inspId: string, lhaId: string) {
    setSelectedLhas((prev) => {
      const current = prev[inspId] ?? new Set();
      const next = new Set(current);
      if (next.has(lhaId)) {
        next.delete(lhaId);
      } else {
        next.add(lhaId);
      }

      // persist lha_ids into inspectionDirty so they get sent to backend
      setInspectionDirty((prevDirty) => ({
        ...prevDirty,
        [inspId]: {
          ...(prevDirty[inspId] ?? {}),
          lha_ids: Array.from(next),
        },
      }));

      return { ...prev, [inspId]: next };
    });
  }

  async function handleAddInspection(
    templateId: string,
    method: InspectionMethod,
  ) {
    if (!id || !mission) return;
    const previousStatus = mission.status;
    try {
      await addInspection(id, { template_id: templateId, method });
      const fresh = await getMission(id);
      updateMissionState(fresh, previousStatus);
      setVisibleInspectionIds(new Set(fresh.inspections.map((i) => i.id)));

      // default all LHAs from template targets as selected for the new inspection
      const template = templateMap.get(templateId);
      if (template) {
        const allLhaIds = allAgls
          .filter((agl) => template.target_agl_ids.includes(agl.id))
          .flatMap((agl) => agl.lhas.map((lha) => lha.id));

        // find the newly added inspection (highest sequence_order)
        const newInsp = fresh.inspections.reduce((a, b) =>
          a.sequence_order > b.sequence_order ? a : b,
        );
        if (allLhaIds.length > 0) {
          // persist lha_ids to backend immediately
          try {
            await updateInspection(id, newInsp.id, { config: { lha_ids: allLhaIds } });
          } catch {
            showNotification(t("mission.config.lhaSaveError"));
          }
          setSelectedLhas((prev) => ({
            ...prev,
            [newInsp.id]: new Set(allLhaIds),
          }));
        }
      }

      setLastSaved(new Date());
      showNotification(t("mission.config.saved"));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        showNotification(t("mission.config.domainError"));
      } else {
        showNotification(t("mission.config.addError"));
      }
    }
  }

  async function handleRemoveInspection(inspId: string) {
    if (!id || !mission) return;
    const previousStatus = mission.status;
    try {
      await removeInspection(id, inspId);
      if (selectedInspectionId === inspId) setSelectedInspectionId(null);
      // clear any pending dirty state for the removed inspection
      setInspectionDirty((prev) => {
        const next = { ...prev };
        delete next[inspId];
        return next;
      });
      const fresh = await getMission(id);
      updateMissionState(fresh, previousStatus);
      setLastSaved(new Date());
      showNotification(t("mission.config.saved"));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        showNotification(t("mission.config.domainError"));
      } else {
        showNotification(t("mission.config.removeError"));
      }
    }
  }

  async function handleReorder(ids: string[]) {
    if (!id || !mission) return;
    const previousStatus = mission.status;
    try {
      await reorderInspections(id, { inspection_ids: ids });
      const fresh = await getMission(id);
      updateMissionState(fresh, previousStatus);
      setLastSaved(new Date());

      const oldIdx = STATUS_ORDER.indexOf(previousStatus);
      const newIdx = STATUS_ORDER.indexOf(fresh.status);
      if (newIdx >= oldIdx) {
        showNotification(t("mission.config.saved"));
      }
    } catch {
      showNotification(t("mission.config.saveError"));
    }
  }

  function handleToggleVisibility(inspId: string) {
    setVisibleInspectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(inspId)) {
        next.delete(inspId);
      } else {
        next.add(inspId);
      }
      return next;
    });
  }

  async function handleComputeTrajectory() {
    if (!id) return;
    setComputing(true);
    try {
      const result = await generateTrajectory(id);
      setFlightPlan(result.flight_plan);

      // warnings are now persisted as violations in the flight plan
      const violations = result.flight_plan.validation_result?.violations ?? [];
      setWarnings(violations.length > 0 ? violations : null);

      const fresh = await getMission(id);
      updateMissionState(fresh);
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 409 || err.response?.status === 422)) {
        const detail = err.response?.data?.detail;
        showNotification(
          typeof detail === "string" ? detail : t("mission.config.trajectoryError"),
        );
      } else {
        showNotification(t("mission.config.trajectoryError"));
      }
    } finally {
      setComputing(false);
    }
  }

  function handleEditWaypoints() {
    if (isDirty) {
      setPendingNav(`/operator-center/missions/${id}/map`);
    } else {
      navigate(`/operator-center/missions/${id}/map`);
    }
  }

  // use refs for map click to avoid stale closures and excess re-renders
  const pickingCoordRef = useRef(pickingCoord);
  pickingCoordRef.current = pickingCoord;
  const missionDirtyRef = useRef(missionDirty);
  missionDirtyRef.current = missionDirty;
  const missionRef = useRef(mission);
  missionRef.current = mission;

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      /** set takeoff or landing coordinate from map click. */
      const target = pickingCoordRef.current;
      if (!target) return;
      const key =
        target === "takeoff"
          ? "takeoff_coordinate"
          : "landing_coordinate";

      // preserve existing altitude if any
      const dirty = missionDirtyRef.current;
      const m = missionRef.current;
      const existing =
        target === "takeoff"
          ? dirty.takeoff_coordinate ?? m?.takeoff_coordinate
          : dirty.landing_coordinate ?? m?.landing_coordinate;
      const alt = existing ? existing.coordinates[2] : 0;

      handleMissionChange({
        [key]: {
          type: "Point" as const,
          coordinates: [lngLat.lng, lngLat.lat, alt],
        },
      });
      setPickingCoord(null);
    },
    [],
  );

  function confirmDiscard() {
    setMissionDirty({});
    setInspectionDirty({});
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }

  // current selected inspection
  const selectedInspection = useMemo(
    () => mission?.inspections.find((i) => i.id === selectedInspectionId),
    [mission, selectedInspectionId],
  );

  // inspection index map for waypoint labels
  const inspectionIndexMap = useMemo(() => {
    if (!mission) return undefined;
    const sorted = [...mission.inspections].sort((a, b) => a.sequence_order - b.sequence_order);
    return Object.fromEntries(sorted.map((insp, i) => [insp.id, i + 1]));
  }, [mission]);

  const selectedTemplate = useMemo(
    () =>
      selectedInspection
        ? templateMap.get(selectedInspection.template_id) ?? null
        : null,
    [selectedInspection, templateMap],
  );

  const currentInspectionConfig = useMemo(() => {
    if (!selectedInspectionId) return {};
    return inspectionDirty[selectedInspectionId] ?? {};
  }, [selectedInspectionId, inspectionDirty]);

  const inspectionLhas = useMemo(() => {
    if (!selectedInspectionId) return new Set<string>();
    return selectedLhas[selectedInspectionId] ?? new Set<string>();
  }, [selectedInspectionId, selectedLhas]);

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

  const hasTrajectory = flightPlan !== null;

  const currentTakeoff = missionDirty.takeoff_coordinate !== undefined
    ? missionDirty.takeoff_coordinate
    : mission.takeoff_coordinate;
  const currentLanding = missionDirty.landing_coordinate !== undefined
    ? missionDirty.landing_coordinate
    : mission.landing_coordinate;

  return (
    <div className="flex px-4 h-[calc(100vh-12rem)]" data-testid="mission-config-page">
      {/* left panel - 30%, mirrors NavBar left section */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ scrollbarGutter: "stable" }}>
        {/* inspection list */}
        <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
          <InspectionList
            inspections={mission.inspections}
            templates={templateMap}
            selectedId={selectedInspectionId}
            onSelect={setSelectedInspectionId}
            onReorder={handleReorder}
            onAdd={() => setShowTemplatePicker(true)}
            onRemove={handleRemoveInspection}
            isDraft={canModify}
            canReorder={canModify}
            visibleIds={visibleInspectionIds}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>

        {/* inspection config - separate container, only when selected */}
        {selectedInspection && selectedTemplate && (
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <InspectionConfigForm
              inspection={selectedInspection}
              template={selectedTemplate}
              agls={allAgls}
              droneProfile={selectedDroneProfile}
              configOverride={currentInspectionConfig}
              onChange={handleInspectionConfigChange}
              selectedLhaIds={inspectionLhas}
              onToggleLha={(lhaId) => {
                if (!selectedInspectionId) return;
                handleToggleLha(selectedInspectionId, lhaId);
              }}
            />
          </div>
        )}

        {/* mission config - always visible, separate container */}
        <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
          <MissionConfigForm
            mission={mission}
            droneProfiles={droneProfiles}
            values={missionDirty}
            onChange={handleMissionChange}
            pickingCoord={pickingCoord}
            onPickCoord={setPickingCoord}
          />
        </div>

        {/* warnings */}
        <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
          <WarningsPanel warnings={warnings} hasTrajectory={hasTrajectory} />
        </div>

        {/* stats */}
        <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
          <StatsPanel
            flightPlan={flightPlan}
            hasTrajectory={hasTrajectory}
            inspectionCount={mission.inspections.length}
            droneProfile={selectedDroneProfile}
          />
        </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* right panel - map, flex-1 matches NavBar right section */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {airportDetail ? (
          <div className={`flex-1 relative rounded-2xl overflow-hidden border border-tv-border ${pickingCoord ? "cursor-crosshair" : ""}`}>
            <AirportMap
              airport={airportDetail}
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              showTerrainToggle={false}
              is3D={is3D}
              onToggle3D={setIs3D}
              waypoints={flightPlan?.waypoints ?? []}
              selectedWaypointId={selectedWaypointId}
              onWaypointClick={setSelectedWaypointId}
              missionStatus={mission?.status}
              onMapClick={pickingCoord ? handleMapClick : undefined}
              takeoffCoordinate={currentTakeoff}
              landingCoordinate={currentLanding}
              inspectionIndexMap={inspectionIndexMap}
              visibleInspectionIds={visibleInspectionIds}
            >
              {/* pick-on-map banner */}
              {pickingCoord && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-tv-accent text-tv-accent-text text-sm font-semibold">
                  {t("mission.config.pickingOnMap", {
                    field: pickingCoord === "takeoff"
                      ? t("mission.config.takeoffCoordinate")
                      : t("mission.config.landingCoordinate"),
                  })}
                </div>
              )}

              {/* stale trajectory warning */}
              {isDraft && hasTrajectory && (
                <div
                  className="absolute top-3 right-52 z-10 flex items-center gap-2 px-4 py-2 rounded-full border border-tv-warning bg-tv-bg text-tv-warning text-xs font-semibold"
                  data-testid="stale-trajectory-warning"
                >
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t("mission.config.staleTrajectory")}
                </div>
              )}

            </AirportMap>

            {/* bottom bar inside map */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={handleEditWaypoints}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="edit-waypoints-btn"
              >
                {t("mission.config.editWaypoints")}
              </button>
              <div className="flex rounded-full border border-tv-border bg-tv-surface p-1">
                <button
                  onClick={() => setIs3D(false)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => setIs3D(true)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  3D
                </button>
              </div>
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-2xl border border-tv-border">
            <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
          </div>
        )}
      </div>

      {/* template picker modal */}
      <TemplatePicker
        isOpen={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        templates={templates}
        onSelect={handleAddInspection}
        usedTemplateIds={new Set(mission.inspections.map((i) => i.template_id))}
      />

      {/* unsaved changes dialog */}
      <Modal
        isOpen={pendingNav !== null}
        onClose={() => setPendingNav(null)}
        title={t("mission.config.unsavedChanges")}
      >
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setPendingNav(null)}
            className="px-4 py-2 rounded-full text-sm font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
          >
            {t("mission.config.keepEditing")}
          </button>
          <button
            onClick={confirmDiscard}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-tv-error text-white hover:opacity-90 transition-colors"
            data-testid="discard-changes-btn"
          >
            {t("mission.config.discardChanges")}
          </button>
        </div>
      </Modal>

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
