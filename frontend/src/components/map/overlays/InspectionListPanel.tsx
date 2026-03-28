import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import type { InspectionResponse } from "@/types/mission";

interface InspectionListPanelProps {
  inspections: InspectionResponse[];
  hiddenInspectionIds: Set<string>;
  onToggleVisibility: (id: string) => void;
  onInspectionClick: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export default function InspectionListPanel({
  inspections,
  hiddenInspectionIds,
  onToggleVisibility,
  onInspectionClick,
  selectedId = null,
  onSelect,
}: InspectionListPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const sorted = [...inspections].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg min-w-[260px] flex-shrink-0"
      data-testid="inspection-list-panel"
    >
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("map.inspectionList")}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-tv-text-secondary transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>
      {!collapsed && (
        <div className="border-t border-tv-border px-1 pb-1 pt-1 max-h-40 overflow-y-auto">
          {sorted.map((insp) => {
            const hidden = hiddenInspectionIds.has(insp.id);
            const isSelected = selectedId === insp.id;
            return (
              <div
                key={insp.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs transition-colors border ${
                  isSelected
                    ? "border-tv-accent bg-tv-surface"
                    : "border-transparent hover:bg-tv-surface-hover"
                }`}
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
                  onClick={() => {
                    onInspectionClick(insp.id);
                    onSelect?.(insp.id);
                  }}
                  className="flex-1 text-left text-tv-text-primary truncate"
                  data-testid={`inspection-item-${insp.id}`}
                >
                  #{insp.sequence_order} {t(`map.inspectionMethod.${insp.method}`)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
