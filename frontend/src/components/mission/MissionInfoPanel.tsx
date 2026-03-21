import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import Badge from "@/components/common/Badge";
import type { MissionDetailResponse } from "@/types/mission";
import type { MissionStatus } from "@/types/enums";

interface MissionInfoPanelProps {
  mission: MissionDetailResponse;
  droneProfileName: string | null;
  runwayName: string | null;
}

function formatDate(iso: string): string {
  /** formats an iso date string to a readable format. */
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function MissionInfoPanel({
  mission,
  droneProfileName,
  runwayName,
}: MissionInfoPanelProps) {
  /** read-only mission info collapsible card. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="mission-info-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span>{t("mission.overview.missionInfo")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-base font-semibold text-tv-text-primary">
            {mission.name}
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-tv-text-secondary">
              {t("mission.overview.status")}
            </span>
            <Badge status={mission.status as MissionStatus} />
          </div>

          <InfoRow
            label={t("mission.overview.inspectionCount")}
            value={String(mission.inspections.length)}
          />
          <InfoRow
            label={t("mission.overview.runway")}
            value={runwayName ?? "\u2014"}
          />
          <InfoRow
            label={t("mission.overview.droneProfile")}
            value={droneProfileName ?? "\u2014"}
          />
          <InfoRow
            label={t("mission.overview.created")}
            value={formatDate(mission.created_at)}
          />
          <InfoRow
            label={t("mission.overview.lastUpdated")}
            value={formatDate(mission.updated_at)}
          />

          {mission.operator_notes && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-tv-text-secondary">
                {t("mission.overview.operatorNotes")}
              </span>
              <p className="text-sm text-tv-text-primary whitespace-pre-wrap">
                {mission.operator_notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  /** single label-value row for mission info. */
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-tv-text-secondary">{label}</span>
      <span className="text-sm text-tv-text-primary">{value}</span>
    </div>
  );
}
