import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";

interface TemplateSelectorDropdownProps {
  templates: InspectionTemplateResponse[];
  currentId: string;
  onSelect: (id: string) => void;
}

export default function TemplateSelectorDropdown({
  templates,
  currentId,
  onSelect,
}: TemplateSelectorDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = templates.find((t) => t.id === currentId);

  function formatMethod(method: string) {
    if (method === "ANGULAR_SWEEP") return t("coordinator.inspections.angularSweep");
    if (method === "VERTICAL_PROFILE") return t("coordinator.inspections.verticalProfile");
    return method;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
      >
        <span className="truncate max-w-[180px]">{current?.name ?? t("coordinator.inspections.switchTemplate")}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-72 overflow-y-auto rounded-2xl border border-tv-border bg-tv-surface z-50">
          <div className="px-3 pt-2 pb-1">
            <span className="text-xs uppercase font-semibold text-tv-text-muted">
              {t("coordinator.inspections.title")}
            </span>
          </div>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => { onSelect(tpl.id); setOpen(false); }}
              disabled={tpl.id === currentId}
              className={`w-full text-left px-3 py-2 transition-colors ${
                tpl.id === currentId
                  ? "bg-[var(--tv-accent)] text-white"
                  : "hover:bg-tv-surface-hover text-tv-text-primary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate flex-1">{tpl.name}</span>
                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tv-status-draft-bg)] text-[var(--tv-status-draft-text)]">
                  {formatMethod(tpl.methods[0] ?? "")}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-tv-text-secondary">
                  {t("coordinator.inspections.usedInMissions", { count: tpl.mission_count ?? 0 })}
                </span>
                <span className="text-xs text-tv-text-muted">
                  {formatDate(tpl.created_at)}
                </span>
                <span className="text-xs text-tv-text-muted">
                  {formatDate(tpl.updated_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
