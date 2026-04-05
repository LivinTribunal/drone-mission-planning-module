import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle, Lightbulb, Navigation } from "lucide-react";
import type { ValidationViolation } from "@/types/flightPlan";
import FeatureInfoPanel from "@/components/common/FeatureInfoPanel";
import Button from "@/components/common/Button";
import { cleanMessage } from "@/utils/violations";

interface WarningInfoPanelProps {
  violation: ValidationViolation;
  onClose: () => void;
  onGoToWaypoint?: (id: string) => void;
}

function SeverityBadge({ severity }: { severity: string }) {
  /** severity badge with icon and color. */
  const { t } = useTranslation();
  if (severity === "violation") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-tv-error/20 text-tv-error">
        <XCircle className="h-3 w-3" />
        {t("map.severityViolation")}
      </span>
    );
  }
  if (severity === "suggestion") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-tv-text-muted/20 text-tv-text-muted">
        <Lightbulb className="h-3 w-3" />
        {t("map.severitySuggestion")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-tv-warning/20 text-tv-warning">
      <AlertTriangle className="h-3 w-3" />
      {t("map.severityWarning")}
    </span>
  );
}

export default function WarningInfoPanel({
  violation,
  onClose,
  onGoToWaypoint,
}: WarningInfoPanelProps) {
  /** detail panel for a selected warning/violation. */
  const { t } = useTranslation();

  const hasWaypoints = violation.waypoint_ids.length > 0;
  const isSingleWaypoint = violation.waypoint_ids.length === 1;

  return (
    <FeatureInfoPanel
      title={t("map.warningInfoTitle")}
      onClose={onClose}
      actions={
        isSingleWaypoint && onGoToWaypoint ? (
          <Button
            variant="secondary"
            onClick={() => onGoToWaypoint(violation.waypoint_ids[0])}
            className="text-xs"
          >
            <Navigation className="h-3 w-3 mr-1" />
            {t("map.warningGoToWaypoint")}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <SeverityBadge severity={violation.severity} />

        {violation.constraint_name && (
          <div className="flex justify-between text-xs">
            <span className="text-tv-text-muted">{t("map.warningConstraint")}</span>
            <span className="text-tv-text-primary font-medium">{violation.constraint_name}</span>
          </div>
        )}

        <p className="text-sm text-tv-text-primary leading-relaxed">
          {cleanMessage(violation.message)}
        </p>

        {hasWaypoints ? (
          <div className="text-xs">
            <span className="text-tv-text-muted">{t("map.warningAffectedWaypoints")}: </span>
            <span className="text-tv-text-primary font-medium">
              {violation.waypoint_ref ?? violation.waypoint_ids.length}
            </span>
          </div>
        ) : (
          <p className="text-xs text-tv-text-muted italic">
            {t("map.warningGlobalWarning")}
          </p>
        )}
      </div>
    </FeatureInfoPanel>
  );
}
