import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { ValidationViolation } from "@/types/flightPlan";

interface WarningsPanelProps {
  warnings: ValidationViolation[] | null;
  hasTrajectory: boolean;
}

export default function WarningsPanel({
  warnings,
  hasTrajectory,
}: WarningsPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="warnings-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span>{t("mission.config.warnings")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

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
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-xl bg-tv-warning/10 border border-tv-warning/20"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-tv-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-tv-text-primary">{w.message}</p>
                  </div>
                  <span className="text-xs font-medium text-tv-warning flex-shrink-0">
                    {w.severity}
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
