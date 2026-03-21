import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { getMission, getFlightPlan } from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";
import type { MissionDetailResponse } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { FlightPlanResponse, ValidationViolation } from "@/types/flightPlan";
import type { MissionTabOutletContext } from "@/components/Layout/MissionTabNav";
import MissionInfoPanel from "@/components/mission/MissionInfoPanel";
import WarningsPanel from "@/components/mission/WarningsPanel";
import StatsPanel from "@/components/mission/StatsPanel";
import ValidationStatusPanel from "@/components/mission/ValidationStatusPanel";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";

export default function MissionOverviewPage() {
  /** read-only mission overview with info, validation, and simplified map. */
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions } =
    useOutletContext<MissionTabOutletContext>();

  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>([]);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [warnings, setWarnings] = useState<ValidationViolation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");

  // wire up disabled save button
  useEffect(() => {
    setSaveContext({
      onSave: () => {},
      isDirty: false,
      isSaving: false,
      lastSaved: mission?.updated_at ? new Date(mission.updated_at) : null,
    });
    return () => {
      setSaveContext({ onSave: null, isDirty: false, isSaving: false, lastSaved: null });
    };
  }, [setSaveContext, mission]);

  // no compute button on overview
  useEffect(() => {
    setComputeContext({ onCompute: null, canCompute: false, isComputing: false });
    return () => {
      setComputeContext({ onCompute: null, canCompute: false, isComputing: false });
    };
  }, [setComputeContext]);

  const fetchData = useCallback(async () => {
    /** load mission, drone profiles, and flight plan. */
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
        if (fp.validation_result?.violations?.length) {
          setWarnings(fp.validation_result.violations);
        }
      } catch {
        setFlightPlan(null);
      }
    } catch {
      setError("mission.config.loadError");
    } finally {
      setLoading(false);
    }
  }, [id, refreshMissions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedDroneProfile = useMemo(() => {
    return droneProfiles.find((dp) => dp.id === mission?.drone_profile_id) ?? null;
  }, [droneProfiles, mission]);

  // find the runway name from airport surfaces
  const runwayName = useMemo(() => {
    if (!airportDetail || !mission) return null;
    const runways = airportDetail.surfaces.filter((s) => s.surface_type === "RUNWAY");
    if (runways.length === 0) return null;
    return runways.map((r) => r.identifier).join(", ");
  }, [airportDetail, mission]);

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
        <p className="text-sm text-tv-error">{t(error ?? "common.error")}</p>
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
    <div className="flex px-4 h-[calc(100vh-12rem)]" data-testid="mission-overview-page">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-4 pr-4"
          style={{ scrollbarGutter: "stable" }}
        >
          {/* mission info */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <MissionInfoPanel
              mission={mission}
              droneProfileName={selectedDroneProfile?.name ?? null}
              runwayName={runwayName}
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

          {/* validation status */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <ValidationStatusPanel
              flightPlan={flightPlan}
              hasTrajectory={hasTrajectory}
            />
          </div>
        </div>
        <div className="w-2.5 flex-shrink-0" />
      </div>

      {/* right panel - map */}
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
              waypoints={flightPlan?.waypoints ?? []}
              missionStatus={mission.status}
              takeoffCoordinate={mission.takeoff_coordinate}
              landingCoordinate={mission.landing_coordinate}
            />

            {/* bottom bar */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={() => navigate(`/operator-center/missions/${id}/map`)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="open-map-btn"
              >
                {t("mission.overview.openMap")}
              </button>
              <button
                onClick={() => navigate(`/operator-center/missions/${id}/configuration`)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="modify-parameters-btn"
              >
                {t("mission.overview.modifyParameters")}
              </button>
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-2xl border border-tv-border">
            <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
          </div>
        )}
      </div>
    </div>
  );
}
