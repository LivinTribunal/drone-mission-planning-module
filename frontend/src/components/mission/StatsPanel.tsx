import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Route,
  Clock,
  MapPin,
  Battery,
  ChevronDown,
  ArrowUpDown,
  Gauge,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { DroneProfileResponse } from "@/types/droneProfile";

interface StatsPanelProps {
  flightPlan: FlightPlanResponse | null;
  hasTrajectory: boolean;
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
          <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.config.estimatedStats")}</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </button>
        {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}
        {!collapsed && (
          <p className="text-sm text-tv-text-muted mt-3">
            {t("mission.config.computeToSeeStats")}
          </p>
        )}
      </div>
    );
  }

  const distanceKm =
    flightPlan?.total_distance != null
      ? (flightPlan.total_distance / 1000).toFixed(2)
      : "\u2014";
  const duration =
    flightPlan?.estimated_duration != null
      ? formatDuration(flightPlan.estimated_duration)
      : "\u2014";
  const waypointCount = flightPlan?.waypoints.length ?? 0;

  let batteryPct = "\u2014";
  if (flightPlan?.estimated_duration != null && droneProfile?.endurance_minutes != null) {
    const consumption =
      (flightPlan.estimated_duration / 60 / droneProfile.endurance_minutes) *
      100;
    batteryPct = `${Math.max(0, Math.round(100 - consumption))}%`;
  }

  const altitudeRange =
    flightPlan?.min_altitude_agl != null && flightPlan?.max_altitude_agl != null
      ? `${flightPlan.min_altitude_agl.toFixed(1)} \u2013 ${flightPlan.max_altitude_agl.toFixed(1)} ${t("common.units.m")} AGL`
      : "\u2014";

  const transitSpeed =
    flightPlan?.transit_speed != null
      ? `${flightPlan.transit_speed} ${t("common.units.ms")}`
      : "\u2014";

  const validationResult = flightPlan?.validation_result;
  let validationValue: string;
  let validationIcon = ShieldCheck;
  let validationColor = "bg-tv-text-muted/20 text-tv-text-muted";
  if (validationResult) {
    const violations = validationResult.violations.filter((v) => v.category === "violation");
    const warnings = validationResult.violations.filter((v) => v.category === "warning");
    if (validationResult.passed && violations.length === 0) {
      validationValue = t("mission.config.validationPassed");
      validationColor = "bg-tv-success/20 text-tv-success";
    } else {
      const parts: string[] = [];
      if (violations.length > 0) parts.push(`${violations.length} ${t("common.violation", { count: violations.length })}`);
      if (warnings.length > 0) parts.push(`${warnings.length} ${t("common.warning", { count: warnings.length })}`);
      validationValue = parts.join(", ") || t("mission.config.validationNotPassed");
      validationIcon = ShieldAlert;
      validationColor = "bg-tv-error/20 text-tv-error";
    }
  } else {
    validationValue = t("mission.config.validationNotRun");
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
      label: t("mission.config.batteryLeft"),
      value: batteryPct,
      icon: Battery,
      colorClass: "bg-tv-error/20 text-tv-error",
    },
    {
      label: t("mission.config.altitudeRange"),
      value: altitudeRange,
      icon: ArrowUpDown,
      colorClass: "bg-tv-info/20 text-tv-info",
    },
    {
      label: t("mission.config.transitSpeed"),
      value: transitSpeed,
      icon: Gauge,
      colorClass: "bg-tv-accent/20 text-tv-accent",
    },
    {
      label: t("mission.config.validation"),
      value: validationValue,
      icon: validationIcon,
      colorClass: validationColor,
    },
  ];

  return (
    <div data-testid="stats-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.config.estimatedStats")}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
      </button>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}
      {!collapsed && (
        <div className="grid grid-cols-2 gap-2 mt-3">
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
