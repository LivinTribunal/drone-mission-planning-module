import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { FlightPlanResponse, ValidationViolation } from "@/types/flightPlan";
import type { MissionStatus } from "@/types/enums";
import Button from "@/components/common/Button";

interface ValidationResultsPanelProps {
  flightPlan: FlightPlanResponse | null;
  missionStatus: MissionStatus;
  onValidate: () => void;
  onNavigateConfig: () => void;
  isValidating: boolean;
}

const VALIDATION_CHECKS = [
  { key: "altitudeCheck", keywords: ["altitude"], isHard: true },
  {
    key: "speedCheck",
    keywords: ["speed"],
    exclude: ["framerate", "frame rate"],
    isHard: true,
  },
  { key: "geofenceCheck", keywords: ["geofence"], isHard: true },
  { key: "batteryCheck", keywords: ["battery"], isHard: false },
  { key: "runwayBuffer", keywords: ["runway"], isHard: true },
  { key: "obstacleClearance", keywords: ["obstacle"], isHard: true },
  { key: "cameraFovCoverage", keywords: ["obstructed", "fov", "coverage"], isHard: false },
  { key: "speedFramerateCompat", keywords: ["framerate"], isHard: false },
] as const;

type CheckResult = "pass" | "fail" | "warn" | "none";

function getCheckResult(
  check: (typeof VALIDATION_CHECKS)[number],
  violations: ValidationViolation[],
): CheckResult {
  for (const v of violations) {
    const msg = v.message.toLowerCase();
    const excluded =
      "exclude" in check &&
      (check as { exclude: readonly string[] }).exclude?.some((kw) =>
        msg.includes(kw),
      );
    if (!excluded && check.keywords.every((kw) => msg.includes(kw))) {
      return v.is_warning ? "warn" : "fail";
    }
  }
  return "pass";
}

export default function ValidationResultsPanel({
  flightPlan,
  missionStatus,
  onValidate,
  onNavigateConfig,
  isValidating,
}: ValidationResultsPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const hasTrajectory = flightPlan !== null;
  const validation = flightPlan?.validation_result;
  const violations = validation?.violations ?? [];

  const warningCount = violations.filter((v) => v.is_warning).length;
  const violationCount = violations.filter((v) => !v.is_warning).length;

  const isApproved =
    missionStatus === "VALIDATED" ||
    missionStatus === "EXPORTED" ||
    missionStatus === "COMPLETED";

  let overallStatus: "passed" | "failed" | "notValidated";
  if (!hasTrajectory || !validation) {
    overallStatus = "notValidated";
  } else if (isApproved) {
    overallStatus = "passed";
  } else if (violationCount > 0) {
    overallStatus = "failed";
  } else {
    overallStatus = "passed";
  }

  const canAccept = missionStatus === "PLANNED";

  return (
    <div data-testid="validation-results-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
          {t("mission.validationExportPage.validationResults")}
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && (
        <div className="mt-3 flex flex-col gap-3">
          {!hasTrajectory ? (
            <p className="text-sm italic text-tv-text-muted">
              {t("mission.validationExportPage.noData")}
            </p>
          ) : (
            <>
              {/* constraint rows */}
              <div className="flex flex-col gap-1.5">
                {VALIDATION_CHECKS.map((check) => {
                  const result = getCheckResult(check, violations);
                  return (
                    <div
                      key={check.key}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-tv-bg"
                      data-testid={`constraint-${check.key}`}
                    >
                      <div className="flex items-center gap-2">
                        <ResultIcon result={result} />
                        <span className="text-sm text-tv-text-primary">
                          {t(`mission.validationExportPage.${check.key}`)}
                        </span>
                      </div>
                      <span className="text-xs text-tv-text-muted">
                        {check.isHard
                          ? t("mission.validationExportPage.hard")
                          : t("mission.validationExportPage.soft")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* overall status */}
              <div className="flex items-center gap-3 pt-2 border-t border-tv-border">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    overallStatus === "passed"
                      ? "bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]"
                      : overallStatus === "failed"
                        ? "bg-[var(--tv-status-cancelled-bg)] text-[var(--tv-status-cancelled-text)]"
                        : "bg-tv-bg text-tv-text-muted border border-tv-border"
                  }`}
                  data-testid="overall-status-badge"
                >
                  {t(`mission.validationExportPage.${overallStatus}`)}
                </span>
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-tv-warning">
                    <AlertTriangle className="h-3 w-3" />
                    {t("mission.validationExportPage.warningCount", {
                      count: warningCount,
                    })}
                  </span>
                )}
                {violationCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-tv-error">
                    <X className="h-3 w-3" />
                    {t("mission.validationExportPage.violationCount", {
                      count: violationCount,
                    })}
                  </span>
                )}
              </div>
            </>
          )}

          {/* action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="secondary" onClick={onNavigateConfig}>
              {t("mission.validationExportPage.editConfiguration")}
            </Button>
            <Button
              variant="primary"
              onClick={onValidate}
              disabled={!canAccept || isValidating}
              data-testid="accept-btn"
            >
              {isValidating
                ? t("mission.validationExportPage.accepting")
                : t("mission.validationExportPage.accept")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultIcon({ result }: { result: CheckResult }) {
  if (result === "pass") {
    return (
      <span className="flex items-center justify-center h-4 w-4 rounded-full bg-tv-accent">
        <Check className="h-2.5 w-2.5 text-white" />
      </span>
    );
  }
  if (result === "fail") {
    return (
      <span className="flex items-center justify-center h-4 w-4 rounded-full bg-tv-error">
        <X className="h-2.5 w-2.5 text-white" />
      </span>
    );
  }
  if (result === "warn") {
    return (
      <span className="flex items-center justify-center h-4 w-4 rounded-full bg-tv-warning">
        <AlertTriangle className="h-2.5 w-2.5 text-white" />
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center h-4 w-4 rounded-full bg-tv-border">
      <Minus className="h-2.5 w-2.5 text-tv-text-muted" />
    </span>
  );
}
