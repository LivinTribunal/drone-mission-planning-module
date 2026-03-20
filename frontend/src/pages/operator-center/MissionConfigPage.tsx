import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
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
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { InspectionMethod } from "@/types/enums";
import type { MissionTabOutletContext } from "@/components/Layout/MissionTabNav";
import InspectionList from "@/components/mission/InspectionList";
import TemplatePicker from "@/components/mission/TemplatePicker";
import MissionConfigForm from "@/components/mission/MissionConfigForm";
import InspectionConfigForm from "@/components/mission/InspectionConfigForm";
import WarningsPanel from "@/components/mission/WarningsPanel";
import StatsPanel from "@/components/mission/StatsPanel";
import AirportMap from "@/components/map/AirportMap";
import WaypointListPanel from "@/components/map/overlays/WaypointListPanel";
import WaypointInfoPanel from "@/components/map/overlays/WaypointInfoPanel";
import Modal from "@/components/common/Modal";

export default function MissionConfigPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const { setSaveContext } = useOutletContext<MissionTabOutletContext>();

  // core data
  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>(
    [],
  );
  const [templates, setTemplates] = useState<InspectionTemplateResponse[]>([]);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

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

  // selected waypoint
  const selectedWaypoint = useMemo(() => {
    if (!flightPlan || !selectedWaypointId) return null;
    return (
      flightPlan.waypoints.find((wp) => wp.id === selectedWaypointId) ?? null
    );
  }, [flightPlan, selectedWaypointId]);

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

      // set all inspections visible by default
      setVisibleInspectionIds(
        new Set(missionData.inspections.map((i) => i.id)),
      );

      // fetch existing flight plan
      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);
      } catch {
        // 404 is expected if no flight plan exists yet
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

    try {
      // save mission-level changes
      if (Object.keys(missionDirty).length > 0) {
        const updatedMission = await updateMission(id, missionDirty);

        // check for status regression
        if (updatedMission.status !== mission.status) {
          showNotification(
            t("mission.config.statusRegressed", {
              status: updatedMission.status,
            }),
          );
        }

        // re-fetch full mission
        const fresh = await getMission(id);
        setMission(fresh);
        setMissionDirty({});
      }

      // save inspection-level changes
      for (const [inspId, override] of Object.entries(inspectionDirty)) {
        await updateInspection(id, inspId, { config: override });
      }
      setInspectionDirty({});

      showNotification(t("mission.config.saved"));
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
      lastSaved: null,
    });

    return () => {
      setSaveContext({
        onSave: null,
        isDirty: false,
        isSaving: false,
        lastSaved: null,
      });
    };
  }, [setSaveContext, handleSave, isDirty, saving]);

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
    if (!id) return;
    try {
      await addInspection(id, { template_id: templateId, method });
      const fresh = await getMission(id);
      setMission(fresh);
      setVisibleInspectionIds(new Set(fresh.inspections.map((i) => i.id)));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        showNotification(t("mission.config.domainError"));
      } else {
        showNotification(t("mission.config.addError"));
      }
    }
  }

  async function handleRemoveInspection(inspId: string) {
    if (!id) return;
    try {
      await removeInspection(id, inspId);
      if (selectedInspectionId === inspId) setSelectedInspectionId(null);
      const fresh = await getMission(id);
      setMission(fresh);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        showNotification(t("mission.config.domainError"));
      } else {
        showNotification(t("mission.config.removeError"));
      }
    }
  }

  async function handleReorder(ids: string[]) {
    if (!id) return;
    try {
      await reorderInspections(id, { inspection_ids: ids });
      const fresh = await getMission(id);
      setMission(fresh);
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
      setWarnings(result.warnings);
      // re-read mission since status may have changed to PLANNED
      const fresh = await getMission(id);
      setMission(fresh);
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 409 || err.response?.status === 422)) {
        showNotification(
          err.response?.data?.detail ?? t("mission.config.trajectoryError"),
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

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]" data-testid="mission-config-page">
      {/* left panel - scrollable config */}
      <div className="w-96 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2">
        {/* inspection list */}
        <div className="bg-tv-surface border border-tv-border rounded-3xl p-4">
          <InspectionList
            inspections={mission.inspections}
            templates={templateMap}
            selectedId={selectedInspectionId}
            onSelect={setSelectedInspectionId}
            onReorder={handleReorder}
            onAdd={() => setShowTemplatePicker(true)}
            onRemove={handleRemoveInspection}
            isDraft={mission.status === "DRAFT"}
            visibleIds={visibleInspectionIds}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>

        {/* config area */}
        <div className="bg-tv-surface border border-tv-border rounded-3xl p-4">
          {selectedInspection && selectedTemplate ? (
            <InspectionConfigForm
              inspection={selectedInspection}
              template={selectedTemplate}
              agls={allAgls}
              droneProfile={selectedDroneProfile}
              configOverride={currentInspectionConfig}
              onChange={handleInspectionConfigChange}
              selectedLhaIds={inspectionLhas}
              onToggleLha={(lhaId) =>
                handleToggleLha(selectedInspectionId!, lhaId)
              }
            />
          ) : (
            <MissionConfigForm
              mission={mission}
              droneProfiles={droneProfiles}
              values={missionDirty}
              onChange={handleMissionChange}
            />
          )}
        </div>

        {/* warnings */}
        <div className="bg-tv-surface border border-tv-border rounded-3xl p-4">
          <WarningsPanel warnings={warnings} hasTrajectory={hasTrajectory} />
        </div>

        {/* stats */}
        <div className="bg-tv-surface border border-tv-border rounded-3xl p-4">
          <StatsPanel
            flightPlan={flightPlan}
            hasTrajectory={hasTrajectory}
            inspectionCount={mission.inspections.length}
            droneProfile={selectedDroneProfile}
          />
        </div>

        {/* drone selector - always visible */}
        <div className="bg-tv-surface border border-tv-border rounded-3xl p-4">
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.droneProfile")}
          </label>
          <select
            value={
              missionDirty.drone_profile_id ?? mission.drone_profile_id ?? ""
            }
            onChange={(e) =>
              handleMissionChange({
                drone_profile_id: e.target.value || null,
              })
            }
            className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="bottom-drone-select"
          >
            <option value="">{t("mission.config.selectDrone")}</option>
            {droneProfiles.map((dp) => (
              <option key={dp.id} value={dp.id}>
                {dp.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* right panel - map */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {airportDetail ? (
          <div className="flex-1 relative rounded-3xl overflow-hidden border border-tv-border">
            <AirportMap airport={airportDetail}>
              {/* waypoint overlays */}
              {hasTrajectory && (
                <div className="absolute top-3 left-56 z-10 flex flex-col gap-2 w-48">
                  <WaypointListPanel
                    waypoints={flightPlan!.waypoints}
                    selectedId={selectedWaypointId}
                    onSelect={setSelectedWaypointId}
                  />
                  <WaypointInfoPanel waypoint={selectedWaypoint} />
                </div>
              )}
            </AirportMap>

            {/* bottom bar inside map */}
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between">
              <div />
              <button
                onClick={handleEditWaypoints}
                className="px-4 py-2 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface/95 backdrop-blur-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="edit-waypoints-btn"
              >
                {t("mission.config.editWaypoints")}
              </button>
              <button
                onClick={handleComputeTrajectory}
                disabled={computing}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  computing
                    ? "bg-tv-accent/50 text-tv-accent-text cursor-not-allowed"
                    : "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover"
                }`}
                data-testid="compute-trajectory-btn"
              >
                {computing && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {computing
                  ? t("mission.config.computing")
                  : t("mission.config.computeTrajectory")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-3xl border border-tv-border">
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
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-tv-surface border border-tv-border shadow-lg text-sm text-tv-text-primary"
          data-testid="notification-toast"
        >
          {notification}
        </div>
      )}
    </div>
  );
}
