import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, CheckCircle, XCircle } from "lucide-react";
import type { FlightPlanResponse } from "@/types/flightPlan";

interface ValidationStatusPanelProps {
  flightPlan: FlightPlanResponse | null;
  hasTrajectory: boolean;
}

// each check has a stable key for i18n and a set of keywords for matching violations
const VALIDATION_CHECKS = [
  { key: "altitudeCheck", keywords: ["altitude"] },
  { key: "speedCheck", keywords: ["speed"] },
  { key: "geofenceCheck", keywords: ["geofence"] },
  { key: "batteryCheck", keywords: ["battery"] },
  { key: "cameraFovCheck", keywords: ["camera", "fov"] },
  { key: "speedFramerateCheck", keywords: ["framerate", "frame rate", "frame_rate"] },
  { key: "runwayBuffer", keywords: ["runway", "buffer"] },
  { key: "obstacleClearance", keywords: ["obstacle", "clearance"] },
] as const;

export default function ValidationStatusPanel({
  flightPlan,
  hasTrajectory,
}: ValidationStatusPanelProps) {
  /** validation status collapsible card with per-check indicators. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const validation = flightPlan?.validation_result;
  const violations = validation?.violations ?? [];

  // derive per-check status from violation messages
  const failedChecks = new Set<string>();
  for (const v of violations) {
    const msg = v.message.toLowerCase();
    for (const check of VALIDATION_CHECKS) {
      if (check.keywords.some((kw) => msg.includes(kw))) {
        failedChecks.add(check.key);
      }
    }
  }

  const warningCount = violations.filter((v) => v.severity === "warning").length;
  const violationCount = violations.filter((v) => v.severity !== "warning").length;

  let overallStatus: "passed" | "failed" | "notValidated";
  if (!hasTrajectory || !validation) {
    overallStatus = "notValidated";
  } else if (validation.passed) {
    overallStatus = "passed";
  } else {
    overallStatus = "failed";
  }

  const badgeStyles: Record<string, string> = {
    passed: "bg-tv-success/20 text-tv-success",
    failed: "bg-tv-error/20 text-tv-error",
    notValidated: "bg-tv-border text-tv-text-muted",
  };

  return (
    <div data-testid="validation-status-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span>{t("mission.overview.validationStatus")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-2">
          {!hasTrajectory ? (
            <p className="text-sm italic text-tv-text-muted">
              {t("mission.overview.noFlightPlan")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-tv-text-secondary">
                  {t("mission.overview.overallStatus")}
                </span>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[overallStatus]}`}
                >
                  {t(`mission.overview.${overallStatus}`)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {VALIDATION_CHECKS.map((check) => {
                  const failed = failedChecks.has(check.key);
                  return (
                    <div
                      key={check.key}
                      className="flex items-center gap-2 text-xs"
                    >
                      {failed ? (
                        <XCircle className="h-3.5 w-3.5 text-tv-error flex-shrink-0" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-tv-success flex-shrink-0" />
                      )}
                      <span className="text-tv-text-primary">
                        {t(`mission.overview.checks.${check.key}`)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 text-xs text-tv-text-secondary mt-1">
                <span>
                  {t("mission.overview.warningCount")}: {warningCount}
                </span>
                <span>
                  {t("mission.overview.violationCount")}: {violationCount}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
