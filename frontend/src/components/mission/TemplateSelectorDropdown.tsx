import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Link, Search } from "lucide-react";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";

interface TemplateSelectorDropdownProps {
  templates: InspectionTemplateResponse[];
  currentId: string;
  onSelect: (id: string) => void;
  isRenaming?: boolean;
  editName?: string;
  onNameChange?: (name: string) => void;
  onRenameFinish?: () => void;
}

/** get inline styles for an inspection method badge. */
function methodBadgeStyle(method: string): React.CSSProperties {
  if (method === "ANGULAR_SWEEP") {
    return {
      backgroundColor: "var(--tv-method-angular-sweep-bg)",
      color: "var(--tv-method-angular-sweep-text)",
    };
  }
  if (method === "VERTICAL_PROFILE") {
    return {
      backgroundColor: "var(--tv-method-vertical-profile-bg)",
      color: "var(--tv-method-vertical-profile-text)",
    };
  }
  return {};
}

export default function TemplateSelectorDropdown({
  templates,
  currentId,
  onSelect,
  isRenaming = false,
  editName,
  onNameChange,
  onRenameFinish,
}: TemplateSelectorDropdownProps) {
  /**template selector with dropdown, search, and inline rename support.*/
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      /**close dropdown on outside click.*/
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // auto-focus search when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const current = templates.find((t) => t.id === currentId);

  const filtered = search
    ? templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : templates;

  function formatMethod(method: string) {
    /**format inspection method for display.*/
    if (method === "ANGULAR_SWEEP") return t("coordinator.inspections.angularSweep");
    if (method === "VERTICAL_PROFILE") return t("coordinator.inspections.verticalProfile");
    return method;
  }

  const displayName = isRenaming ? editName : (current?.name ?? t("coordinator.inspections.switchTemplate"));

  return (
    <div className="relative" ref={ref}>
      {/* selected template container */}
      <div
        onClick={() => { if (!isRenaming) setOpen(!open); }}
        className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm cursor-pointer transition-colors border bg-tv-bg ${
          open ? "border-tv-accent" : "border-tv-border hover:bg-tv-surface-hover"
        }`}
      >
        <div className="flex items-center gap-2">
          {isRenaming ? (
            <input
              value={editName ?? ""}
              onChange={(e) => onNameChange?.(e.target.value)}
              onBlur={() => onRenameFinish?.()}
              onKeyDown={(e) => { if (e.key === "Enter") onRenameFinish?.(); }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm font-medium text-tv-text-primary bg-transparent focus:outline-none min-w-0"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-tv-text-primary truncate font-medium">
              {displayName}
            </span>
          )}
          {(current?.mission_count ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-tv-text-secondary" title={t("coordinator.inspections.usedInMissions", { count: current?.mission_count ?? 0 })}>
              <Link className="h-3 w-3" />
              <span className="text-xs font-medium">{current?.mission_count}</span>
            </span>
          )}
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs"
            style={methodBadgeStyle(current?.methods[0] ?? "")}
          >
            {formatMethod(current?.methods[0] ?? "")}
          </span>
          <ChevronDown className={`h-4 w-4 text-tv-text-secondary flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl border border-tv-border bg-tv-surface z-50">
          {/* search bar */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tv-text-muted" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("coordinator.inspections.searchPlaceholder")}
                className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              />
            </div>
          </div>

          {/* template list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-tv-text-muted text-center">
                {t("coordinator.inspections.noMatch")}
              </p>
            ) : (
              filtered.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => { onSelect(tpl.id); setOpen(false); setSearch(""); }}
                  disabled={tpl.id === currentId}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    tpl.id === currentId
                      ? "bg-tv-accent text-tv-accent-text"
                      : "hover:bg-tv-surface-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate flex-1 ${tpl.id === currentId ? "font-medium" : "text-tv-text-primary"}`}>
                      {tpl.name}
                    </span>
                    {(tpl.mission_count ?? 0) > 0 && (
                      <span
                        className={`flex items-center gap-0.5 ${tpl.id === currentId ? "text-tv-accent-text/70" : "text-tv-text-secondary"}`}
                        title={t("coordinator.inspections.usedInMissions", { count: tpl.mission_count ?? 0 })}
                      >
                        <Link className="h-3 w-3" />
                        <span className="text-xs font-medium">{tpl.mission_count}</span>
                      </span>
                    )}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${tpl.id === currentId ? "bg-tv-accent-text/20 text-tv-accent-text" : ""}`}
                      style={tpl.id === currentId ? {} : methodBadgeStyle(tpl.methods[0] ?? "")}
                    >
                      {formatMethod(tpl.methods[0] ?? "")}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
