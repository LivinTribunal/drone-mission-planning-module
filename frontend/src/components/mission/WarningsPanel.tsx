import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { ValidationViolation } from "@/types/flightPlan";

interface WarningsPanelProps {
  warnings: ValidationViolation[] | null;
  hasTrajectory: boolean;
}

export default function WarningsPanel({
  warnings,
  hasTrajectory,
}: WarningsPanelProps) {
  /** warnings and violations panel with grouped sections. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const { warningItems, violationItems } = useMemo(() => {
    if (!warnings) return { warningItems: [], violationItems: [] };
    return {
      warningItems: warnings.filter((w) => w.is_warning),
      violationItems: warnings.filter((w) => !w.is_warning),
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
          {warningItems.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-white bg-tv-warning">
              {warningItems.length}
            </span>
          )}
          {violationItems.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-white bg-tv-error">
              {violationItems.length}
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

          {hasTrajectory && warnings && warnings.length > 0 && (
            <div className="flex flex-col gap-4">
              {/* violations group */}
              {violationItems.length > 0 && (
                <div>
                  <span className="text-sm font-semibold text-tv-error mb-2 block">
                    {t("mission.validationExportPage.violationsLabel")} ({violationItems.length})
                  </span>
                  <div className="space-y-2">
                    {violationItems.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-2xl bg-tv-error/10 border border-tv-error/20"
                      >
                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-tv-error/20 flex-shrink-0 mt-0.5">
                          <XCircle className="h-4 w-4 text-tv-error" />
                        </div>
                        <p className="flex-1 min-w-0 text-sm text-tv-text-primary leading-relaxed">{w.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* warnings group */}
              {warningItems.length > 0 && (
                <div>
                  <span className="text-sm font-semibold text-tv-warning mb-2 block">
                    {t("mission.validationExportPage.warningsLabel")} ({warningItems.length})
                  </span>
                  <div className="space-y-2">
                    {warningItems.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-2xl bg-tv-warning/10 border border-tv-warning/20"
                      >
                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-tv-warning/20 flex-shrink-0 mt-0.5">
                          <AlertTriangle className="h-4 w-4 text-tv-warning" />
                        </div>
                        <p className="flex-1 min-w-0 text-sm text-tv-text-primary leading-relaxed">{w.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
