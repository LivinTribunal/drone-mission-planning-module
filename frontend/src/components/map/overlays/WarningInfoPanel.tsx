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

interface ParsedValues {
  actual?: string;
  expected?: string;
  suggestion?: string;
}

/** extract expected vs actual values and fix suggestion from violation message. */
function parseMessageValues(message: string, kind: string | null): ParsedValues {
  const result: ParsedValues = {};

  // speed exceeds: "speed 5.0 m/s exceeds optimal 3.2 m/s for frame rate 30 fps"
  const speedMatch = message.match(/speed ([\d.]+\s*m\/s).*(?:optimal|max speed) ([\d.]+\s*m\/s)/i);
  if (speedMatch) {
    result.actual = speedMatch[1];
    result.expected = `≤ ${speedMatch[2]}`;
    result.suggestion = "reduce flight speed or increase measurement spacing";
    return result;
  }

  // altitude exceeds: "waypoint alt 350m exceeds drone max altitude 300m"
  const altMatch = message.match(/alt(?:itude)? ([\d.]+\s*m).*max altitude ([\d.]+\s*m)/i);
  if (altMatch) {
    result.actual = altMatch[1];
    result.expected = `≤ ${altMatch[2]}`;
    result.suggestion = "lower the inspection altitude or use a drone with higher ceiling";
    return result;
  }

  // obstacle: "waypoint at 350m intersects obstacle 'X' (top: 360m)"
  const obsMatch = message.match(/at ([\d.]+\s*m).*obstacle.*top:\s*([\d.]+\s*m)/i);
  if (obsMatch) {
    result.actual = obsMatch[1];
    result.expected = `> ${obsMatch[2]}`;
    result.suggestion = "raise waypoint altitude above obstacle clearance";
    return result;
  }

  // FOV: "LHA array span 95.0 exceeds sensor FOV 84.0 at 50m"
  const fovMatch = message.match(/span ([\d.]+).*FOV ([\d.]+).*at ([\d.]+\s*m)/i);
  if (fovMatch) {
    result.actual = `${fovMatch[1]}°`;
    result.expected = `≤ ${fovMatch[2]}°`;
    result.suggestion = `increase horizontal distance beyond ${fovMatch[3]}`;
    return result;
  }

  // crossing: "crosses RUNWAY X (150m)"
  const crossMatch = message.match(/crosses\s+(\w+\s+\S+)\s+\((\d+)m\)/i);
  if (crossMatch) {
    result.actual = `${crossMatch[2]}m crossing ${crossMatch[1]}`;
    result.suggestion = "adjust transit path to avoid surface crossing";
    return result;
  }

  // camera obstruction
  if (kind === "camera_obstruction" || message.includes("obstructed")) {
    result.suggestion = "adjust waypoint position or remove blocking obstacle";
    return result;
  }

  // safety zone
  if (kind === "safety_zone" || message.includes("zone")) {
    result.suggestion = "reroute path outside the restricted zone";
    return result;
  }

  // battery
  if (kind === "battery" || message.includes("battery")) {
    result.suggestion = "reduce mission distance or split into multiple flights";
    return result;
  }

  // density
  if (message.includes("density")) {
    result.suggestion = "increase measurement density override in inspection config";
    return result;
  }

  // default suggestions
  if (message.includes("default")) {
    result.suggestion = "set an explicit override in the inspection configuration";
    return result;
  }

  return result;
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

function InfoRow({ label, value }: { label: string; value: string }) {
  /** key-value row for violation details. */
  return (
    <div className="flex justify-between text-xs">
      <span className="text-tv-text-muted">{label}</span>
      <span className="text-tv-text-primary font-medium">{value}</span>
    </div>
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
  const parsed = parseMessageValues(violation.message, violation.violation_kind ?? null);

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
          <InfoRow label={t("map.warningConstraint")} value={violation.constraint_name} />
        )}

        <p className="text-sm text-tv-text-primary leading-relaxed">
          {cleanMessage(violation.message)}
        </p>

        {parsed.actual && (
          <InfoRow label={t("map.warningActual")} value={parsed.actual} />
        )}

        {parsed.expected && (
          <InfoRow label={t("map.warningExpected")} value={parsed.expected} />
        )}

        {parsed.suggestion && (
          <div className="flex gap-1 text-xs">
            <Lightbulb className="h-3 w-3 text-tv-text-muted flex-shrink-0 mt-0.5" />
            <span className="text-tv-text-muted italic">{parsed.suggestion}</span>
          </div>
        )}

        {hasWaypoints ? (
          <InfoRow
            label={t("map.warningAffectedWaypoints")}
            value={violation.waypoint_ref ?? String(violation.waypoint_ids.length)}
          />
        ) : (
          <p className="text-xs text-tv-text-muted italic">
            {t("map.warningGlobalWarning")}
          </p>
        )}
      </div>
    </FeatureInfoPanel>
  );
}
