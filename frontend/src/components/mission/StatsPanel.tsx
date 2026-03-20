import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Route,
  Clock,
  MapPin,
  ListChecks,
  Battery,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  const [collapsed, setCollapsed] = useState(false);

  if (!hasTrajectory) {
    return (
      <div data-testid="stats-panel">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
        >
          <span>{t("mission.config.estimatedStats")}</span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
        {!collapsed && (
          <p className="text-sm text-tv-text-muted mt-2">
            {t("mission.config.computeToSeeStats")}
          </p>
        )}
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
    {
      label: t("mission.config.totalDistance"),
      value: `${distanceKm} km`,
      icon: Route,
      colorClass: "bg-tv-info/20 text-tv-info",
    },
    {
      label: t("mission.config.estimatedDuration"),
      value: duration,
      icon: Clock,
      colorClass: "bg-tv-accent/20 text-tv-accent",
    },
    {
      label: t("mission.config.waypointCount"),
      value: waypointCount.toString(),
      icon: MapPin,
      colorClass: "bg-tv-warning/20 text-tv-warning",
    },
    {
      label: t("mission.config.inspectionCount"),
      value: inspectionCount.toString(),
      icon: ListChecks,
      colorClass: "bg-tv-accent/20 text-tv-accent",
    },
    {
      label: t("mission.config.batteryConsumption"),
      value: batteryPct,
      icon: Battery,
      colorClass: "bg-tv-error/20 text-tv-error",
    },
  ];

  return (
    <div data-testid="stats-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span>{t("mission.config.estimatedStats")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
      {!collapsed && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center gap-2 p-2 rounded-xl bg-tv-bg">
                <div
                  className={`flex items-center justify-center h-7 w-7 rounded-full ${stat.colorClass}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-tv-text-muted truncate">{stat.label}</p>
                  <p className="text-sm font-semibold text-tv-text-primary">
                    {stat.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
