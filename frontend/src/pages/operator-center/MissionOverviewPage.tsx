import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { useComputation } from "@/contexts/ComputationContext";
import { useOnComputationCompleted } from "@/hooks/useOnComputationCompleted";
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
import PoiInfoPanel from "@/components/map/overlays/PoiInfoPanel";
import type { MapFeature } from "@/types/map";

export default function MissionOverviewPage() {
  /** read-only mission overview with info, validation, and simplified map. */
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const { setSaveContext, setComputeContext, refreshMissions, updateMissionFromPage, leftPanelEl } =
    useOutletContext<MissionTabOutletContext>();
  const computation = useComputation();

  const [mission, setMission] = useState<MissionDetailResponse | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>([]);
  const [flightPlan, setFlightPlan] = useState<FlightPlanResponse | null>(null);
  const [warnings, setWarnings] = useState<ValidationViolation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState<ValidationViolation | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  const inspectionIndexMap = useMemo(() => {
    if (!mission) return undefined;
    const sorted = [...mission.inspections].sort((a, b) => a.sequence_order - b.sequence_order);
    return Object.fromEntries(sorted.map((insp, i) => [insp.id, i + 1]));
  }, [mission]);

  useOnComputationCompleted((result) => {
    setFlightPlan(result);
    const violations = result.validation_result?.violations ?? [];
    setWarnings(violations.length > 0 ? violations : null);

    if (id) {
      getMission(id)
        .then((fresh) => {
          setMission(fresh);
          refreshMissions();
        })
        .catch((err) => console.warn("mission refresh failed", err));
    }
  });

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

  // compute trajectory button in header
  const hasCoordinates = !!(mission?.takeoff_coordinate && mission?.landing_coordinate);
  const computeLabel = flightPlan
    ? t("map.recomputeTrajectory")
    : t("map.computeTrajectory");

  useEffect(() => {
    setComputeContext({
      onCompute: id ? () => computation.startComputation(id) : null,
      canCompute: hasCoordinates && !computation.isComputing,
      isComputing: computation.isComputing,
      label: computeLabel,
    });
    return () => {
      setComputeContext({ onCompute: null, canCompute: false, isComputing: false });
    };
  }, [setComputeContext, computation.isComputing, computation.startComputation, hasCoordinates, computeLabel, id]);

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
      updateMissionFromPage(missionData);
      refreshMissions();

      try {
        const fp = await getFlightPlan(id);
        setFlightPlan(fp);
        const violations = fp.validation_result?.violations ?? [];
        setWarnings(violations.length > 0 ? violations : null);
      } catch (err) {
        console.error("flight plan fetch failed:", err instanceof Error ? err.message : String(err));
        setFlightPlan(null);
      }
    } catch (err) {
      console.error("mission fetch failed:", err instanceof Error ? err.message : String(err));
      setError("mission.config.loadError");
    } finally {
      setLoading(false);
    }
  }, [id, refreshMissions, updateMissionFromPage]);

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
    <>
      {/* left panel content - portaled into MissionTabNav left column */}
      {leftPanelEl && createPortal(
        <>
          {/* mission info */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <MissionInfoPanel
              mission={mission}
              droneProfileName={selectedDroneProfile?.name ?? null}
              runwayName={runwayName}
              validationPassed={flightPlan?.validation_result?.passed ?? null}
            />
          </div>

          {/* stats */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <StatsPanel
              flightPlan={flightPlan}
              hasTrajectory={hasTrajectory}
              droneProfile={selectedDroneProfile}
            />
          </div>

          {/* validation status */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <ValidationStatusPanel
              flightPlan={flightPlan}
              hasTrajectory={hasTrajectory}
              missionStatus={mission.status}
            />
          </div>

          {/* warnings */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <WarningsPanel
              warnings={warnings}
              hasTrajectory={hasTrajectory}
              onWarningClick={setSelectedWarning}
              selectedWarningId={selectedWarning?.id}
            />
          </div>

        </>,
        leftPanelEl,
      )}

      {/* right panel - map */}
      <div className="flex flex-col h-full" data-testid="mission-overview-page">
        {airportDetail ? (
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-tv-border">
            <AirportMap
              airport={airportDetail}
              helpVariant="preview"
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              showTerrainToggle={false}
              showWaypointList={false}
              showPoiInfo={false}
              simplifiedTrajectory
              is3D={is3D}
              onToggle3D={setIs3D}
              layers={{
                simplifiedTrajectory: true,
                trajectory: false,
                transitWaypoints: false,
                measurementWaypoints: false,
                path: false,
                takeoffLanding: !!(mission.takeoff_coordinate || mission.landing_coordinate),
                cameraHeading: false,
                pathHeading: false,
              }}
              waypoints={flightPlan?.waypoints ?? []}
              selectedWaypointId={selectedWaypointId}
              onWaypointClick={setSelectedWaypointId}
              missionStatus={mission.status}
              takeoffCoordinate={mission.takeoff_coordinate}
              landingCoordinate={mission.landing_coordinate}
              inspectionIndexMap={inspectionIndexMap}
              onFeatureClick={setSelectedFeature}
              focusFeature={selectedFeature}
              highlightedWaypointIds={selectedWarning?.waypoint_ids}
              highlightSeverity={selectedWarning?.severity}
              selectedWarning={selectedWarning}
              onWarningClose={() => setSelectedWarning(null)}
            >
              {selectedFeature && (
                <div className="absolute top-3 right-3 z-10 w-56">
                  <PoiInfoPanel
                    feature={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                  />
                </div>
              )}
            </AirportMap>

            {/* bottom bar */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={() => navigate(`/operator-center/missions/${id}/configuration`)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="modify-parameters-btn"
              >
                {t("mission.overview.modifyParameters")}
              </button>
              <button
                onClick={() => navigate(`/operator-center/missions/${id}/map`)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="open-map-btn"
              >
                {t("mission.overview.openMap")}
              </button>
              <div className="flex rounded-full border border-tv-border bg-tv-surface p-1">
                <button
                  onClick={() => setIs3D(false)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  {t("common.2d")}
                </button>
                <button
                  onClick={() => setIs3D(true)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  {t("common.3d")}
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

    </>
  );
}
