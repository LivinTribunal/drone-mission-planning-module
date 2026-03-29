import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function CoordinatorMapHelpPanel() {
  /** expandable help panel showing coordinator map keyboard shortcuts. */
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      /** close panel on outside click. */
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
        className="flex items-center gap-1.5 rounded-full border border-tv-border bg-tv-surface px-3 py-1.5 text-xs text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
        aria-label={t("coordinator.airports.help.title")}
        data-testid="coordinator-help-btn"
      >
        <span className="font-medium">?</span>
        <span>{t("coordinator.airports.help.controls")}</span>
      </button>
    );
  }

  const shortcuts = [
    { key: "S", desc: t("coordinator.airports.help.shortcutSelect") },
    { key: "P", desc: t("coordinator.airports.help.shortcutPan") },
    { key: "W", desc: t("coordinator.airports.help.shortcutMoveFeature") },
    { key: "M", desc: t("coordinator.airports.help.shortcutMeasurement") },
    { key: "G", desc: t("coordinator.airports.help.shortcutDrawPolygon") },
    { key: "C", desc: t("coordinator.airports.help.shortcutDrawCircle") },
    { key: "E", desc: t("coordinator.airports.help.shortcutDrawRectangle") },
    { key: "V", desc: t("coordinator.airports.help.shortcutEditVertices") },
    { key: "Z", desc: t("coordinator.airports.help.shortcutZoom") },
    { key: "R", desc: t("coordinator.airports.help.shortcutReset") },
    { key: "Ctrl+Z", desc: t("coordinator.airports.help.shortcutUndo") },
    { key: "Ctrl+Shift+Z", desc: t("coordinator.airports.help.shortcutRedo") },
    { key: "Esc", desc: t("coordinator.airports.help.shortcutEscape") },
    { key: "Del", desc: t("coordinator.airports.help.shortcutDelete") },
  ];

  return (
    <div
      ref={ref}
      className="w-72 rounded-2xl border border-tv-border bg-tv-surface p-3"
      data-testid="coordinator-help-panel"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-tv-text-primary">
          {t("coordinator.airports.help.title")}
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

      <div className="space-y-0.5">
        {shortcuts.map(({ key, desc }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <kbd className="rounded px-1.5 py-0.5 bg-tv-bg border border-tv-border text-tv-text-primary font-mono text-[10px] min-w-[2rem] text-center">
              {key}
            </kbd>
            <span className="text-tv-text-secondary">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
