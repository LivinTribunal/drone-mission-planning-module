import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import type { InspectionResponse } from "@/types/mission";

interface InspectionListPanelProps {
  inspections: InspectionResponse[];
  hiddenInspectionIds: Set<string>;
  onToggleVisibility: (id: string) => void;
  onInspectionClick: (id: string) => void;
}

export default function InspectionListPanel({
  inspections,
  hiddenInspectionIds,
  onToggleVisibility,
  onInspectionClick,
}: InspectionListPanelProps) {
  const { t } = useTranslation();

  const sorted = [...inspections].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg min-w-[260px] flex-shrink-0"
      data-testid="inspection-list-panel"
    >
      <div className="px-3 py-2">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("map.inspectionList")}
        </span>
      </div>
      <div className="border-t border-tv-border px-1 pb-1 pt-1 max-h-40 overflow-y-auto">
        {sorted.map((insp) => {
          const hidden = hiddenInspectionIds.has(insp.id);
          return (
            <div
              key={insp.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs hover:bg-tv-surface-hover transition-colors"
            >
              <button
                onClick={() => onToggleVisibility(insp.id)}
                className="flex-shrink-0 text-tv-text-secondary hover:text-tv-text-primary transition-colors"
                title={hidden ? t("map.showInspection") : t("map.hideInspection")}
                data-testid={`toggle-visibility-${insp.id}`}
              >
                {hidden ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => onInspectionClick(insp.id)}
                className="flex-1 text-left text-tv-text-primary truncate"
                data-testid={`inspection-item-${insp.id}`}
              >
                #{insp.sequence_order} {insp.method.replace(/_/g, " ")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
