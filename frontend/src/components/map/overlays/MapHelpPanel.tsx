import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function MapHelpPanel() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-tv-border bg-tv-surface text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
        aria-label={t("dashboard.mapHelpTitle")}
        data-testid="map-help-btn"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    );
  }

  return (
    <div ref={ref} className="w-56 rounded-2xl border border-tv-border bg-tv-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-tv-text-primary">
          {t("dashboard.mapHelpTitle")}
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="rounded-full p-0.5 text-tv-text-secondary hover:bg-tv-surface-hover"
          aria-label={t("common.close")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <ul className="space-y-1.5 text-xs text-tv-text-secondary">
        <li>{t("dashboard.mapHelpDrag")}</li>
        <li>{t("dashboard.mapHelpRotate")}</li>
        <li>{t("dashboard.mapHelpClick")}</li>
        <li>{t("dashboard.mapHelpWasd")}</li>
      </ul>
    </div>
  );
}
