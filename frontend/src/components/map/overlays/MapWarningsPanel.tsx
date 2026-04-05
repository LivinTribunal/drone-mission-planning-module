import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle, Lightbulb } from "lucide-react";
import type { ValidationViolation, ViolationSeverity } from "@/types/flightPlan";
import { cleanMessage } from "@/utils/violations";

interface MapWarningsPanelProps {
  violations: ValidationViolation[];
  onWarningClick?: (violation: ValidationViolation) => void;
  selectedWarningId?: string | null;
}

function SeverityDot({ severity }: { severity: ViolationSeverity }) {
  /** compact severity indicator for map overlay. */
  if (severity === "violation") {
    return <XCircle className="h-3 w-3 text-tv-error flex-shrink-0 mt-0.5" />;
  }
  if (severity === "suggestion") {
    return <Lightbulb className="h-3 w-3 text-tv-text-muted flex-shrink-0 mt-0.5" />;
  }
  return <AlertTriangle className="h-3 w-3 text-tv-warning flex-shrink-0 mt-0.5" />;
}

export default function MapWarningsPanel({
  violations,
  onWarningClick,
  selectedWarningId,
}: MapWarningsPanelProps) {
  /** compact warnings table for map overlay with scrollable content. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const sorted = useMemo(() => {
    const order: Record<ViolationSeverity, number> = { violation: 0, warning: 1, suggestion: 2 };
    return [...violations].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [violations]);

  if (violations.length === 0) return null;

  const warnings = violations.filter((v) => v.severity === "warning");
  const errors = violations.filter((v) => v.severity === "violation");

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg w-full overflow-hidden flex-shrink-0"
      data-testid="map-warnings-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">
          {t("map.warnings")}
        </span>
        <div className="flex items-center gap-1">
          {errors.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1 text-[10px] font-semibold text-white bg-tv-error">
              {errors.length}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1 text-[10px] font-semibold text-white bg-tv-warning">
              {warnings.length}
            </span>
          )}
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
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border max-h-48 overflow-y-auto">
          {/* compact header */}
          <div className="grid grid-cols-[1rem_3.5rem_1fr_2rem] gap-1 px-2 py-1 border-b border-tv-border">
            <span />
            <span className="text-[9px] font-semibold uppercase text-tv-text-secondary">
              {t("mission.validationExportPage.constraintName")}
            </span>
            <span className="text-[9px] font-semibold uppercase text-tv-text-secondary">
              {t("mission.config.warningsMessage")}
            </span>
            <span className="text-[9px] font-semibold uppercase text-tv-text-secondary">
              {t("map.warningsWaypointHeader")}
            </span>
          </div>

          {sorted.map((v, idx) => {
            const isSelected = selectedWarningId === v.id;
            const borderColor = v.severity === "violation"
              ? "border-l-tv-error"
              : v.severity === "warning"
                ? "border-l-tv-warning"
                : "border-l-tv-text-muted";
            return (
              <div
                key={v.id}
                onClick={() => onWarningClick?.(v)}
                className={`grid grid-cols-[1rem_3.5rem_1fr_2rem] gap-1 px-2 py-1 items-start hover:bg-tv-surface-hover transition-colors ${
                  idx < sorted.length - 1 ? "border-b border-tv-border" : ""
                } ${onWarningClick ? "cursor-pointer" : ""} ${
                  isSelected ? `border-l-2 ${borderColor}` : ""
                }`}
              >
                <SeverityDot severity={v.severity} />
                <span className="text-[10px] text-tv-text-secondary truncate mt-0.5">
                  {v.constraint_name ?? "-"}
                </span>
                <span className="text-xs text-tv-text-primary">
                  {cleanMessage(v.message)}
                </span>
                <span className="text-[10px] text-tv-text-secondary mt-0.5">
                  {v.waypoint_ref ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
