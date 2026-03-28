import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import type { ValidationViolation, ViolationSeverity } from "@/types/flightPlan";
import { cleanMessage } from "@/utils/violations";

interface WarningsPanelProps {
  warnings: ValidationViolation[] | null;
  hasTrajectory: boolean;
}

function SeverityIcon({ severity }: { severity: ViolationSeverity }) {
  /** render icon for violation severity level. */
  if (severity === "violation") {
    return (
      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-error/20 flex-shrink-0">
        <XCircle className="h-3 w-3 text-tv-error" />
      </div>
    );
  }
  if (severity === "suggestion") {
    return (
      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-text-muted/20 flex-shrink-0">
        <Lightbulb className="h-3 w-3 text-tv-text-muted" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-warning/20 flex-shrink-0">
      <AlertTriangle className="h-3 w-3 text-tv-warning" />
    </div>
  );
}

export default function WarningsPanel({
  warnings,
  hasTrajectory,
}: WarningsPanelProps) {
  /** warnings and violations table with severity, constraint, message, and waypoint columns. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const sorted = useMemo(() => {
    if (!warnings) return [];
    const order: Record<ViolationSeverity, number> = { violation: 0, warning: 1, suggestion: 2 };
    return [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [warnings]);

  const { violationCount, warningCount } = useMemo(() => {
    if (!warnings) return { violationCount: 0, warningCount: 0 };
    return {
      violationCount: warnings.filter((w) => w.severity === "violation").length,
      warningCount: warnings.filter((w) => w.severity === "warning").length,
    };
  }, [warnings]);

  return (
    <div data-testid="warnings-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.config.warningsAndViolations")}</span>
        <div className="flex items-center gap-2">
          {warningCount > 0 && (
            <span className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-white bg-tv-warning">
              {warningCount}
            </span>
          )}
          {violationCount > 0 && (
            <span className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-white bg-tv-error">
              {violationCount}
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </div>
      </button>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && (
        <div className="mt-2">
          {!hasTrajectory && (
            <p className="text-sm text-tv-text-muted">
              {t("mission.config.computeToSeeWarnings")}
            </p>
          )}

          {hasTrajectory && (!warnings || warnings.length === 0) && (
            <p className="text-sm text-tv-text-muted">
              {t("mission.config.noWarnings")}
            </p>
          )}

          {hasTrajectory && sorted.length > 0 && (
            <div className="rounded-2xl border border-tv-border bg-tv-bg overflow-hidden">
              {/* header */}
              <div className="grid grid-cols-[2rem_5rem_1fr_3rem] gap-2 px-3 py-2 border-b border-tv-border">
                <span className="text-[10px] font-semibold uppercase text-tv-text-secondary" />
                <span className="text-[10px] font-semibold uppercase text-tv-text-secondary">
                  {t("mission.validationExportPage.constraintName")}
                </span>
                <span className="text-[10px] font-semibold uppercase text-tv-text-secondary">
                  {t("mission.config.warningsMessage")}
                </span>
                <span className="text-[10px] font-semibold uppercase text-tv-text-secondary">
                  {t("mission.config.warningsWaypoint")}
                </span>
              </div>

              {/* rows */}
              {sorted.map((w, idx) => (
                <div
                  key={w.id}
                  className={`grid grid-cols-[2rem_5rem_1fr_3rem] gap-2 px-3 py-2 items-start hover:bg-tv-surface-hover transition-colors ${
                    idx < sorted.length - 1 ? "border-b border-tv-border" : ""
                  }`}
                >
                  <SeverityIcon severity={w.severity} />
                  <span className="text-xs text-tv-text-secondary truncate mt-0.5">
                    {w.constraint_name ?? "-"}
                  </span>
                  <p className="text-sm text-tv-text-primary leading-relaxed">
                    {cleanMessage(w.message)}
                  </p>
                  <span className="text-xs text-tv-text-secondary mt-0.5">
                    {w.waypoint_ref ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
