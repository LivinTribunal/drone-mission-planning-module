import { useTranslation } from "react-i18next";
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { DroneProfileResponse } from "@/types/droneProfile";

interface StatsPanelProps {
  flightPlan: FlightPlanResponse | null;
  hasTrajectory: boolean;
  inspectionCount: number;
  droneProfile: DroneProfileResponse | null;
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function StatsPanel({
  flightPlan,
  hasTrajectory,
  inspectionCount,
  droneProfile,
}: StatsPanelProps) {
  const { t } = useTranslation();

  if (!hasTrajectory) {
    return (
      <div data-testid="stats-panel">
        <h3 className="text-sm font-semibold text-tv-text-primary mb-2">
          {t("mission.config.estimatedStats")}
        </h3>
        <p className="text-sm text-tv-text-muted">
          {t("mission.config.computeToSeeStats")}
        </p>
      </div>
    );
  }

  const distanceKm = flightPlan?.total_distance
    ? (flightPlan.total_distance / 1000).toFixed(2)
    : "\u2014";
  const duration = flightPlan?.estimated_duration
    ? formatDuration(flightPlan.estimated_duration)
    : "\u2014";
  const waypointCount = flightPlan?.waypoints.length ?? 0;

  let batteryPct = "\u2014";
  if (flightPlan?.estimated_duration && droneProfile?.endurance_minutes) {
    const pct =
      (flightPlan.estimated_duration / 60 / droneProfile.endurance_minutes) *
      100;
    batteryPct = `${Math.round(pct)}%`;
  }

  const stats = [
    { label: t("mission.config.totalDistance"), value: `${distanceKm} km` },
    { label: t("mission.config.estimatedDuration"), value: duration },
    {
      label: t("mission.config.waypointCount"),
      value: waypointCount.toString(),
    },
    {
      label: t("mission.config.inspectionCount"),
      value: inspectionCount.toString(),
    },
    { label: t("mission.config.batteryConsumption"), value: batteryPct },
  ];

  return (
    <div data-testid="stats-panel">
      <h3 className="text-sm font-semibold text-tv-text-primary mb-2">
        {t("mission.config.estimatedStats")}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="p-2 rounded-xl bg-tv-surface">
            <p className="text-xs text-tv-text-muted">{stat.label}</p>
            <p className="text-sm font-semibold text-tv-text-primary">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
