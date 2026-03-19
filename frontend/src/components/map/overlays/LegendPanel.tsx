import { useState } from "react";
import { useTranslation } from "react-i18next";

const zoneItems = [
  { key: "ctr", color: "#4595e5", i18nKey: "dashboard.ctr" },
  { key: "restricted", color: "#e5a545", i18nKey: "dashboard.restricted" },
  { key: "prohibited", color: "#e54545", i18nKey: "dashboard.prohibited" },
  {
    key: "temporaryNoFly",
    color: "#e5e545",
    i18nKey: "dashboard.temporaryNoFly",
  },
];

const obstacleItems = [
  { key: "building", color: "#e54545", i18nKey: "dashboard.building" },
  { key: "tower", color: "#9b59b6", i18nKey: "dashboard.tower" },
  { key: "antenna", color: "#e5a545", i18nKey: "dashboard.antenna" },
  { key: "vegetation", color: "#3bbb3b", i18nKey: "dashboard.vegetation" },
];

const otherItems = [
  { key: "agl", color: "#4595e5", i18nKey: "dashboard.aglMarker" },
  { key: "lha", color: "#60a5fa", i18nKey: "dashboard.lhaMarker" },
];

export default function LegendPanel() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute top-3 right-3 z-10 w-44 rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="legend-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">{t("dashboard.legend")}</span>
        <svg
          className={`ml-2 h-4 w-4 text-tv-text-secondary transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {!collapsed && (
        <div className="border-t border-tv-border px-3 pb-2 pt-1 space-y-2">
          <div>
            <p className="text-[10px] font-medium uppercase text-tv-text-muted mb-1">
              {t("dashboard.safetyZones")}
            </p>
            {zoneItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm border"
                  style={{
                    backgroundColor: item.color + "33",
                    borderColor: item.color,
                  }}
                />
                {t(item.i18nKey)}
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-tv-text-muted mb-1">
              {t("dashboard.obstacles")}
            </p>
            {obstacleItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {t(item.i18nKey)}
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-tv-text-muted mb-1">
              {t("dashboard.aglSystems")}
            </p>
            {otherItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {t(item.i18nKey)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
