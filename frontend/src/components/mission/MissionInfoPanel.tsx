import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MissionDetailResponse } from "@/types/mission";

interface MissionInfoPanelProps {
  mission: MissionDetailResponse;
  droneProfileName: string | null;
  runwayName: string | null;
  validationPassed: boolean | null;
}

function formatDateTime(iso: string): string {
  /** formats an iso date string to dd/mm/yyyy HH:MM. */
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

export default function MissionInfoPanel({
  mission,
  droneProfileName,
  runwayName,
  validationPassed,
}: MissionInfoPanelProps) {
  /** read-only mission info collapsible card. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const isApproved = mission.status === "VALIDATED" || mission.status === "EXPORTED" || mission.status === "COMPLETED";

  return (
    <div data-testid="mission-info-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.overview.missionInfo")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && (
        <div className="mt-3">
          {/* two-column grid */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: `var(--tv-status-${mission.status.toLowerCase()}-bg)`,
                color: `var(--tv-status-${mission.status.toLowerCase()}-text)`,
              }}
            >
              <p className="text-xs opacity-75">{t("mission.overview.missionStatus")}:</p>
              <p className="text-sm font-semibold">{t(`missionStatus.${mission.status}`)}</p>
            </div>
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: isApproved
                  ? "var(--tv-status-validated-bg)"
                  : validationPassed === null
                    ? "var(--tv-status-draft-bg)"
                    : validationPassed
                      ? "var(--tv-status-validated-bg)"
                      : "var(--tv-status-cancelled-bg)",
                color: isApproved
                  ? "var(--tv-status-validated-text)"
                  : validationPassed === null
                    ? "var(--tv-status-draft-text)"
                    : validationPassed
                      ? "var(--tv-status-validated-text)"
                      : "var(--tv-status-cancelled-text)",
              }}
            >
              <p className="text-xs opacity-75">{t("mission.overview.validationStatusLabel")}:</p>
              <p className="text-sm font-semibold">
                {isApproved
                  ? t("mission.overview.approved")
                  : validationPassed === null
                    ? t("mission.overview.notValidated")
                    : validationPassed
                      ? t("mission.overview.passed")
                      : t("mission.overview.failed")}
              </p>
            </div>
            <InfoCell
              label={t("mission.overview.inspectionCount")}
              value={String(mission.inspections.length)}
            />
            <InfoCell
              label={t("mission.overview.groundSurfaces")}
              value={runwayName ?? "\u2014"}
            />
            <InfoCell
              label={t("mission.overview.droneProfile")}
              value={droneProfileName ?? "\u2014"}
            />
            <InfoCell
              label={t("mission.overview.created")}
              value={formatDateTime(mission.created_at)}
            />
            <InfoCell
              label={t("mission.overview.lastUpdated")}
              value={formatDateTime(mission.updated_at)}
            />
          </div>

          <div className="mt-2 p-2 rounded-xl bg-tv-bg">
            <p className="text-xs text-tv-text-muted">{t("mission.overview.operatorNotes")}:</p>
            {mission.operator_notes ? (
              <p className="text-sm text-tv-text-primary mt-0.5 whitespace-pre-wrap">
                {mission.operator_notes}
              </p>
            ) : (
              <p className="text-sm mt-0.5" style={{ color: "var(--tv-text-muted)" }}>
                {t("mission.overview.noNotes")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  /** single cell in the two-column grid. */
  return (
    <div className="p-2 rounded-xl bg-tv-bg">
      <p className="text-xs text-tv-text-muted truncate">{label}:</p>
      <p className="text-sm font-semibold text-tv-text-primary">{value}</p>
    </div>
  );
}
