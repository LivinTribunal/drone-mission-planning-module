import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import {
  getMission,
  getFlightPlan,
  validateMission,
  exportMissionFiles,
  completeMission,
  cancelMission,
  deleteMission,
} from "@/api/missions";
import type { MissionDetailResponse } from "@/types/mission";
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { MissionTabOutletContext } from "@/components/Layout/MissionTabNav";
import type { ValidationViolation } from "@/types/flightPlan";
import type { DroneProfileResponse } from "@/types/droneProfile";
import { listDroneProfiles } from "@/api/droneProfiles";
import ValidationResultsPanel from "@/components/mission/ValidationResultsPanel";
import WarningsPanel from "@/components/mission/WarningsPanel";
import StatsPanel from "@/components/mission/StatsPanel";
import ExportPanel from "@/components/mission/ExportPanel";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";

export default function MissionValidationPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions } =
    useOutletContext<MissionTabOutletContext>();

  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [warnings, setWarnings] = useState<ValidationViolation[] | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">(
    "satellite",
  );

  // wire up disabled save button
  useEffect(() => {
    setSaveContext({
      onSave: () => {},
      isDirty: false,
      isSaving: false,
      lastSaved: mission?.updated_at ? new Date(mission.updated_at) : null,
    });
    return () => {
      setSaveContext({
        onSave: null,
        isDirty: false,
        isSaving: false,
        lastSaved: null,
      });
    };
  }, [setSaveContext, mission]);

  // upload drone media placeholder button in header
  useEffect(() => {
    setComputeContext({
      onCompute: () => {},
      canCompute: false,
      isComputing: false,
      label: t("mission.validationExportPage.uploadDroneMedia"),
      variant: "secondary",
      icon: "upload",
    });
    return () => {
      setComputeContext({
        onCompute: null,
        canCompute: false,
        isComputing: false,
      });
    };
  }, [setComputeContext]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [missionData, dpData] = await Promise.all([
        getMission(id),
        listDroneProfiles(),
      ]);
      setMission(missionData);
      setDroneProfiles(dpData.data);
      refreshMissions();

      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);
        const violations = fp.validation_result?.violations ?? [];
        setWarnings(violations.length > 0 ? violations : null);
      } catch (err) {
        console.error("failed to load flight plan:", err instanceof Error ? err.message : String(err));
        setFlightPlan(null);
        setWarnings(null);
      }
    } catch (err) {
      console.error("failed to load mission:", err instanceof Error ? err.message : String(err));
      setError("mission.config.loadError");
    } finally {
      setLoading(false);
    }
  }, [id, refreshMissions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // re-fetch on tab/window focus
  useEffect(() => {
    function handleFocus() {
      fetchData();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") fetchData();
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchData]);

  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  function showNotification(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  async function handleValidate() {
    if (!id) return;
    setIsValidating(true);
    try {
      await validateMission(id);
      await fetchData();
    } catch (err) {
      console.error("validation failed:", err instanceof Error ? err.message : String(err));
      showNotification(t("mission.validationExportPage.acceptError"));
    } finally {
      setIsValidating(false);
    }
  }

  async function handleExport(formats: string[]) {
    if (!id || !mission) return;
    setIsExporting(true);
    try {
      const blob = await exportMissionFiles(id, formats);

      // trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // filename from content type
      if (formats.length === 1) {
        const ext =
          formats[0] === "KML"
            ? "kml"
            : formats[0] === "KMZ"
              ? "kmz"
              : formats[0] === "JSON"
                ? "json"
                : "waypoints";
        a.download = `mission_${mission.name}.${ext}`;
      } else {
        a.download = `mission_${mission.name}_export.zip`;
      }

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await fetchData();
    } catch (err) {
      console.error("export failed:", err instanceof Error ? err.message : String(err));
      showNotification(t("mission.validationExportPage.exportError"));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleComplete() {
    if (!id) return;
    try {
      await completeMission(id);
      await fetchData();
    } catch (err) {
      console.error("complete failed:", err instanceof Error ? err.message : String(err));
      showNotification(t("mission.validationExportPage.completeError"));
    }
  }

  async function handleCancel() {
    if (!id) return;
    try {
      await cancelMission(id);
      await fetchData();
    } catch (err) {
      console.error("cancel failed:", err instanceof Error ? err.message : String(err));
      showNotification(t("mission.validationExportPage.cancelError"));
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteMission(id);
      navigate("/operator-center/missions");
    } catch (err) {
      console.error("delete failed:", err instanceof Error ? err.message : String(err));
      showNotification(t("mission.validationExportPage.deleteError"));
    }
  }

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
        <p className="text-sm text-tv-error">
          {t(error ?? "common.error")}
        </p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex px-4 h-[calc(100vh-12rem)]"
      data-testid="mission-validation-page"
    >
      {/* notification toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-full bg-tv-error text-white text-sm font-semibold">
          {notification}
        </div>
      )}

      {/* left panel - validation results */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-4"
          style={{ scrollbarGutter: "stable" }}
        >
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <ValidationResultsPanel
              flightPlan={flightPlan}
              missionStatus={mission.status}
              onValidate={handleValidate}
              onNavigateConfig={() =>
                navigate(
                  `/operator-center/missions/${id}/configuration`,
                )
              }
              isValidating={isValidating}
            />
          </div>

          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <WarningsPanel warnings={warnings} hasTrajectory={flightPlan !== null} />
          </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* center panel - map preview */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {airportDetail ? (
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-tv-border">
            <AirportMap
              airport={airportDetail}
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              showTerrainToggle={false}
              showWaypointList={false}
              simplifiedTrajectory={true}
              layers={{
                simplifiedTrajectory: true,
                trajectory: false,
                transitWaypoints: false,
                measurementWaypoints: false,
                path: false,
                takeoffLanding: false,
                cameraHeading: false,
                pathHeading: false,
              }}
              waypoints={flightPlan?.waypoints ?? []}
              missionStatus={mission.status}
              takeoffCoordinate={mission.takeoff_coordinate}
              landingCoordinate={mission.landing_coordinate}
            />

            {/* bottom bar */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={() =>
                  navigate(`/operator-center/missions/${id}/map`)
                }
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="open-map-btn"
              >
                {t("mission.validationExportPage.openMap")}
              </button>
              <TerrainToggle
                mode={terrainMode}
                onToggle={setTerrainMode}
                inline
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-2xl border border-tv-border">
            <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
          </div>
        )}
      </div>

      {/* right panel - export & lifecycle, aligned with airport selector + theme + user */}
      <div className="w-4 flex-shrink-0" />
      <div className="w-[540px] flex-shrink-0">
        <div
          className="overflow-y-auto h-full flex flex-col gap-4"
          style={{ scrollbarGutter: "stable" }}
        >
          <ExportPanel
            mission={mission}
            onExport={handleExport}
            onComplete={handleComplete}
            onCancel={handleCancel}
            onDelete={handleDelete}
            isExporting={isExporting}
            statsSlot={
              <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
                <StatsPanel
                  flightPlan={flightPlan}
                  hasTrajectory={flightPlan !== null}
                  inspectionCount={mission.inspections.length}
                  droneProfile={droneProfiles.find((dp) => dp.id === mission.drone_profile_id) ?? null}
                />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
