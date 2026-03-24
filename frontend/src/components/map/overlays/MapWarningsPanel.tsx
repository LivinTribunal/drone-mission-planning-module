import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle } from "lucide-react";
import type { ValidationViolation } from "@/types/flightPlan";

interface MapWarningsPanelProps {
  violations: ValidationViolation[];
}

export default function MapWarningsPanel({
  violations,
}: MapWarningsPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  if (violations.length === 0) return null;

  const warnings = violations.filter((v) => v.is_warning);
  const errors = violations.filter((v) => !v.is_warning);

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg w-full overflow-hidden flex-shrink-0"
      data-testid="map-warnings-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">
          {t("map.warnings")}
        </span>
        <div className="flex items-center gap-1">
          {errors.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1 text-[10px] font-semibold text-white bg-tv-error">
              {errors.length}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1 text-[10px] font-semibold text-white bg-tv-warning">
              {warnings.length}
            </span>
          )}
          <svg
            className={`h-3 w-3 text-tv-text-secondary transition-transform ${collapsed ? "" : "rotate-180"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border px-2 py-2 max-h-48 overflow-y-auto space-y-1">
          {errors.map((v) => (
            <div
              key={v.id}
              className="flex items-start gap-1.5 px-2 py-1 rounded-xl text-xs"
            >
              <XCircle className="h-3 w-3 text-tv-error flex-shrink-0 mt-0.5" />
              <span className="text-tv-text-primary">{v.message}</span>
            </div>
          ))}
          {warnings.map((v) => (
            <div
              key={v.id}
              className="flex items-start gap-1.5 px-2 py-1 rounded-xl text-xs"
            >
              <AlertTriangle className="h-3 w-3 text-tv-warning flex-shrink-0 mt-0.5" />
              <span className="text-tv-text-primary">{v.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
