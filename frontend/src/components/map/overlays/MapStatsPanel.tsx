import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Route, Clock, MapPin, Battery, Layers, ArrowUpDown, Gauge, ShieldCheck, ShieldAlert } from "lucide-react";
import type { FlightPlanResponse } from "@/types/flightPlan";

interface MapStatsPanelProps {
  flightPlan: FlightPlanResponse;
  inspectionCount: number;
  enduranceMinutes?: number | null;
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function MapStatsPanel({
  flightPlan,
  inspectionCount,
  enduranceMinutes,
}: MapStatsPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const distanceKm =
    flightPlan.total_distance != null
      ? (flightPlan.total_distance / 1000).toFixed(2)
      : "\u2014";
  const duration =
    flightPlan.estimated_duration != null
      ? formatDuration(flightPlan.estimated_duration)
      : "\u2014";
  const waypointCount = flightPlan.waypoints.length;

  let batteryPct = "\u2014";
  if (flightPlan.estimated_duration != null && enduranceMinutes != null) {
    const consumption =
      (flightPlan.estimated_duration / 60 / enduranceMinutes) * 100;
    batteryPct = `${Math.max(0, Math.round(100 - consumption))}%`;
  }

  const altitudeRange =
    flightPlan.min_altitude_agl != null && flightPlan.max_altitude_agl != null
      ? `${flightPlan.min_altitude_agl.toFixed(1)} \u2013 ${flightPlan.max_altitude_agl.toFixed(1)} ${t("common.units.m")} AGL`
      : "\u2014";

  const transitSpeed =
    flightPlan.transit_speed != null
      ? `${flightPlan.transit_speed} ${t("common.units.ms")}`
      : "\u2014";

  const validationResult = flightPlan.validation_result;
  let validationValue: string;
  let validationIcon = ShieldCheck;
  if (validationResult) {
    const violations = validationResult.violations.filter((v) => v.category === "violation");
    const warnings = validationResult.violations.filter((v) => v.category === "warning");
    if (validationResult.passed && violations.length === 0) {
      validationValue = t("map.validationPassed");
      validationIcon = ShieldCheck;
    } else {
      const parts: string[] = [];
      if (violations.length > 0) parts.push(`${violations.length} ${t("common.violation", { count: violations.length })}`);
      if (warnings.length > 0) parts.push(`${warnings.length} ${t("common.warning", { count: warnings.length })}`);
      validationValue = parts.join(", ") || t("map.validationNotPassed");
      validationIcon = ShieldAlert;
    }
  } else {
    validationValue = t("map.validationNotRun");
  }

  const stats = [
    { label: t("map.totalDistance"), value: `${distanceKm} km`, icon: Route },
    { label: t("map.duration"), value: duration, icon: Clock },
    {
      label: t("map.waypointCount"),
      value: waypointCount.toString(),
      icon: MapPin,
    },
    {
      label: t("map.inspectionCount"),
      value: inspectionCount.toString(),
      icon: Layers,
    },
    {
      label: t("map.batteryLeft"),
      value: batteryPct,
      icon: Battery,
    },
    {
      label: t("map.altitudeRange"),
      value: altitudeRange,
      icon: ArrowUpDown,
    },
    {
      label: t("map.transitSpeed"),
      value: transitSpeed,
      icon: Gauge,
    },
    {
      label: t("map.validation"),
      value: validationValue,
      icon: validationIcon,
    },
  ];

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg w-full overflow-hidden flex-shrink-0"
      data-testid="map-stats-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">
          {t("map.estimatedStats")}
        </span>
        <svg
          className={`h-3 w-3 text-tv-text-secondary transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border px-2 py-2 space-y-1 max-h-48 overflow-y-auto">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="flex items-center gap-2 px-2 py-1 text-xs"
              >
                <Icon className="h-3 w-3 text-tv-text-secondary flex-shrink-0" />
                <span className="text-tv-text-secondary flex-1">{stat.label}</span>
                <span className="text-tv-text-primary font-medium">
                  {stat.value}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
