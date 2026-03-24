import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { InspectionResponse } from "@/types/mission";

interface InspectionSelectProps {
  inspections: InspectionResponse[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function InspectionSelect({
  inspections,
  selectedId,
  onSelect,
}: InspectionSelectProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg min-w-[260px] flex-shrink-0"
      data-testid="inspection-select"
    >
      <div className="relative px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
            {t("map.inspectionSelect")}
          </span>
        </div>
        <div className="mt-1.5 relative">
          <select
            value={selectedId ?? ""}
            onChange={(e) => onSelect(e.target.value || null)}
            className="w-full appearance-none rounded-xl bg-tv-surface border border-tv-border px-3 py-1.5 pr-8 text-xs text-tv-text-primary outline-none focus:border-tv-accent"
          >
            <option value="">{t("map.noInspectionSelected")}</option>
            {inspections.map((insp) => (
              <option key={insp.id} value={insp.id}>
                #{insp.sequence_order} {insp.method.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-tv-text-muted pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
