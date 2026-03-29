import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AGLResponse } from "@/types/airport";

interface TemplateAglSectionProps {
  agl: AGLResponse | null;
  selectedLhaIds: Set<string>;
  onToggleLha: (lhaId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isEditing: boolean;
}

export default function TemplateAglSection({
  agl,
  selectedLhaIds,
  onToggleLha,
  onSelectAll,
  onDeselectAll,
  isEditing,
}: TemplateAglSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (!agl) {
    return (
      <p className="text-sm text-tv-text-muted">
        {t("airport.noAglSystems")}
      </p>
    );
  }

  const allSelected = agl.lhas.length > 0 && agl.lhas.every((lha) => selectedLhaIds.has(lha.id));

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-tv-text-secondary flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-tv-text-secondary flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-tv-text-primary">
            {agl.name}
          </span>
          <span className="ml-2 text-xs text-tv-text-secondary">
            {agl.agl_type}{agl.side ? ` - ${agl.side}` : ""}
          </span>
        </div>
        <span className="text-xs text-tv-text-muted">
          {selectedLhaIds.size}/{agl.lhas.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 ml-6">
          {isEditing && agl.lhas.length > 1 && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={allSelected ? onDeselectAll : onSelectAll}
                className="text-xs text-tv-accent hover:underline"
              >
                {allSelected
                  ? t("coordinator.inspections.deselectAll")
                  : t("coordinator.inspections.selectAll")}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {agl.lhas.map((lha) => (
              <label
                key={lha.id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedLhaIds.has(lha.id)}
                  onChange={() => onToggleLha(lha.id)}
                  disabled={!isEditing}
                  className="rounded accent-tv-accent"
                />
                <span className="text-tv-text-primary">
                  {t("coordinator.inspections.lhaUnit", { number: lha.unit_number })}
                </span>
                <span className="text-tv-text-muted text-xs">
                  {lha.setting_angle?.toFixed(2) ?? "—"}&deg;
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
