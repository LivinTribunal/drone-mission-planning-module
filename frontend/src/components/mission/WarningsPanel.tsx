import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

interface WarningsPanelProps {
  warnings: string[] | null;
  hasTrajectory: boolean;
}

export default function WarningsPanel({
  warnings,
  hasTrajectory,
}: WarningsPanelProps) {
  const { t } = useTranslation();

  return (
    <div data-testid="warnings-panel">
      <h3 className="text-sm font-semibold text-tv-text-primary mb-2">
        {t("mission.config.warnings")}
      </h3>

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
              <p className="text-xs text-tv-text-primary">{w}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
