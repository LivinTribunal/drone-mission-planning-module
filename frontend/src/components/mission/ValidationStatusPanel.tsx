import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import type { FlightPlanResponse } from "@/types/flightPlan";

interface ValidationStatusPanelProps {
  flightPlan: FlightPlanResponse | null;
  hasTrajectory: boolean;
  missionStatus?: string;
}

// each check matches violations where ALL keywords appear in the message
const VALIDATION_CHECKS = [
  { key: "altitudeCheck", keywords: ["altitude"] },
  { key: "speedCheck", keywords: ["speed"], exclude: ["framerate", "frame rate"] },
  { key: "geofenceCheck", keywords: ["geofence"] },
  { key: "batteryCheck", keywords: ["battery"] },
  { key: "cameraObstructionCheck", keywords: ["obstructed"] },
  { key: "speedFramerateCheck", keywords: ["framerate"] },
  { key: "runwayBuffer", keywords: ["runway"] },
  { key: "obstacleClearance", keywords: ["obstacle"] },
] as const;

const STATUS_STYLES = {
  approved: {
    bg: "bg-[var(--tv-status-validated-bg)]",
    text: "text-[var(--tv-status-validated-text)]",
    label: "text-[var(--tv-status-validated-text)]",
  },
  passed: {
    bg: "bg-[var(--tv-status-validated-bg)]",
    text: "text-[var(--tv-status-validated-text)]",
    label: "text-[var(--tv-status-validated-text)]",
  },
  warnings: {
    bg: "bg-[rgba(229,165,69,0.15)]",
    text: "text-tv-warning",
    label: "text-tv-warning",
  },
  failed: {
    bg: "bg-[var(--tv-status-cancelled-bg)]",
    text: "text-[var(--tv-status-cancelled-text)]",
    label: "text-[var(--tv-status-cancelled-text)]",
  },
  notValidated: {
    bg: "bg-tv-bg",
    text: "text-tv-text-muted",
    label: "text-tv-text-muted",
  },
};

export default function ValidationStatusPanel({
  flightPlan,
  hasTrajectory,
  missionStatus,
}: ValidationStatusPanelProps) {
  /** validation status with summary card and expandable check details. */
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const validation = flightPlan?.validation_result;
  const violations = validation?.violations ?? [];

  const failedChecks = new Set<string>();
  for (const v of violations) {
    const msg = v.message.toLowerCase();
    for (const check of VALIDATION_CHECKS) {
      const excluded = "exclude" in check && (check as { exclude: readonly string[] }).exclude?.some((kw) => msg.includes(kw));
      if (!excluded && check.keywords.every((kw) => msg.includes(kw))) {
        failedChecks.add(check.key);
      }
    }
  }

  const passedCount = VALIDATION_CHECKS.length - failedChecks.size;
  const warningCount = violations.filter((v) => v.is_warning).length;
  const violationCount = violations.filter((v) => !v.is_warning).length;

  const isApproved = missionStatus === "VALIDATED" || missionStatus === "EXPORTED" || missionStatus === "COMPLETED";

  let overallStatus: "approved" | "passed" | "warnings" | "failed" | "notValidated";
  if (!hasTrajectory || !validation) {
    overallStatus = "notValidated";
  } else if (isApproved) {
    overallStatus = "approved";
  } else if (violationCount > 0) {
    overallStatus = "failed";
  } else if (warningCount > 0) {
    overallStatus = "warnings";
  } else {
    overallStatus = "passed";
  }

  const styles = STATUS_STYLES[overallStatus];

  return (
    <div data-testid="validation-status-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.overview.validationStatus")}</span>
        <div className="flex items-center gap-2">
          {hasTrajectory && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              overallStatus === "approved"
                ? "bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]"
                : overallStatus === "passed"
                  ? "bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]"
                  : overallStatus === "warnings"
                    ? "bg-[rgba(229,165,69,0.15)] text-tv-warning"
                    : overallStatus === "failed"
                      ? "bg-[var(--tv-status-cancelled-bg)] text-[var(--tv-status-cancelled-text)]"
                      : "bg-tv-bg text-tv-text-muted"
            }`}>
              {t(`mission.overview.statusBadge.${overallStatus}`)}
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
        <div className="mt-3">
          {!hasTrajectory ? (
            <p className="text-sm italic text-tv-text-muted">
              {t("mission.overview.noFlightPlan")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* summary card */}
              <div className={`rounded-xl p-3 ${styles.bg}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={`text-sm font-semibold ${styles.text}`}>
                    {t(`mission.overview.${overallStatus}`)}
                  </p>
                  {(overallStatus === "warnings" || overallStatus === "failed") && (
                    <button
                      onClick={() => navigate(`/operator-center/missions/${id}/validation-export`)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-colors whitespace-nowrap ${
                        overallStatus === "warnings"
                          ? "text-tv-warning border-tv-warning/30 hover:bg-tv-warning hover:text-white hover:border-tv-warning"
                          : "text-tv-error border-tv-error/30 hover:bg-tv-error hover:text-white hover:border-tv-error"
                      }`}
                    >
                      {t("mission.overview.needsManualApproval")}
                    </button>
                  )}
                  <span className={`text-xs ${styles.label} ml-auto`}>
                    {passedCount}/{VALIDATION_CHECKS.length} {t("mission.overview.checksPassed")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-tv-text-secondary">
                    {t("mission.overview.warningCount")}: {warningCount}
                  </span>
                  <span className="text-xs text-tv-text-secondary">
                    {t("mission.overview.violationCount")}: {violationCount}
                  </span>
                </div>
              </div>

              {/* expandable check details */}
              <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="flex items-center gap-1 text-xs text-tv-text-secondary hover:text-tv-text-primary transition-colors ml-auto"
              >
                {detailsExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {t("mission.overview.checkDetails")}
              </button>

              {detailsExpanded && (
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-tv-border">
                  {VALIDATION_CHECKS.map((check) => {
                    const failed = failedChecks.has(check.key);
                    return (
                      <div
                        key={check.key}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs ${
                          failed
                            ? "bg-[var(--tv-status-cancelled-bg)] text-[var(--tv-status-cancelled-text)]"
                            : "bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]"
                        }`}
                      >
                        <span className={`flex items-center justify-center h-4 w-4 rounded-full ${
                          failed ? "bg-tv-error" : "bg-tv-accent"
                        }`}>
                          {failed ? (
                            <X className="h-2.5 w-2.5 text-white" />
                          ) : (
                            <Check className="h-2.5 w-2.5 text-white" />
                          )}
                        </span>
                        <span className="truncate">
                          {t(`mission.overview.checks.${check.key}`)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
