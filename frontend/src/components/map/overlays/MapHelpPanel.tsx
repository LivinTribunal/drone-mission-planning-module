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
        className="flex items-center gap-1.5 rounded-full border border-tv-border bg-tv-surface px-3 py-1.5 text-xs text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
        aria-label={t("map.help.title")}
        data-testid="map-help-btn"
      >
        <span className="font-medium">?</span>
        <span>{t("map.help.controls")}</span>
      </button>
    );
  }

  const shortcuts = [
    { key: "S", desc: t("map.help.shortcutSelect") },
    { key: "P", desc: t("map.help.shortcutPan") },
    { key: "W", desc: t("map.help.shortcutMove") },
    { key: "M", desc: t("map.help.shortcutMeasure") },
    { key: "Z", desc: t("map.help.shortcutZoom") },
    { key: "R", desc: t("map.help.shortcutReset") },
    { key: "Ctrl+Z", desc: t("map.tools.undo") },
    { key: "Ctrl+Shift+Z", desc: t("map.tools.redo") },
    { key: "Esc", desc: t("map.help.shortcutEscape") },
    { key: t("map.help.rightClick"), desc: t("map.help.shortcutClearMeasure") },
    { key: t("map.help.middleMouse"), desc: t("map.help.shortcutTilt") },
    { key: t("map.help.scroll"), desc: t("map.help.shortcutScroll") },
  ];

  const tools = [
    { name: t("map.tools.select"), desc: t("map.help.descSelect") },
    { name: t("map.tools.pan"), desc: t("map.help.descPan") },
    { name: t("map.tools.moveWaypoint"), desc: t("map.help.descMove") },
    { name: t("map.tools.measure"), desc: t("map.help.descMeasure") },
    { name: t("map.tools.zoom"), desc: t("map.help.descZoom") },
  ];

  return (
    <div
      ref={ref}
      className="w-72 rounded-2xl border border-tv-border bg-tv-surface p-3"
      data-testid="map-help-panel"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-tv-text-primary">
          {t("map.help.title")}
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

      {/* keyboard shortcuts */}
      <div className="mb-2">
        <div className="text-xs font-semibold text-tv-text-secondary mb-1">
          {t("map.help.keyboardShortcuts")}
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

      {/* tool descriptions */}
      <div>
        <div className="text-xs font-semibold text-tv-text-secondary mb-1">
          {t("map.help.toolDescriptions")}
        </div>
        <div className="space-y-1">
          {tools.map(({ name, desc }) => (
            <div key={name} className="text-xs">
              <span className="font-medium text-tv-text-primary">{name}:</span>{" "}
              <span className="text-tv-text-secondary">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
