import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapLayerConfig } from "@/types/map";

interface LayerPanelProps {
  layers: MapLayerConfig;
  onToggle: (key: keyof MapLayerConfig) => void;
  hasWaypoints?: boolean;
  hasSimplifiedTrajectory?: boolean;
}

const baseLayerKeys: { key: keyof MapLayerConfig; i18nKey: string }[] = [
  { key: "runways", i18nKey: "dashboard.runways" },
  { key: "taxiways", i18nKey: "dashboard.taxiways" },
  { key: "safetyZones", i18nKey: "dashboard.safetyZones" },
  { key: "obstacles", i18nKey: "dashboard.obstacles" },
  { key: "aglSystems", i18nKey: "dashboard.aglSystems" },
];

export default function LayerPanel({ layers, onToggle, hasWaypoints, hasSimplifiedTrajectory }: LayerPanelProps) {
  /** layer visibility toggle panel. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const layerKeys = [
    ...baseLayerKeys,
    ...(hasWaypoints
      ? [{ key: "waypoints" as keyof MapLayerConfig, i18nKey: "dashboard.waypoints" }]
      : []),
    ...(hasSimplifiedTrajectory
      ? [{ key: "simplifiedTrajectory" as keyof MapLayerConfig, i18nKey: "dashboard.simplifiedTrajectory" }]
      : []),
  ];

  return (
    <div
      className="z-10 rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="layer-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">{t("dashboard.layers")}</span>
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
        <div className="border-t border-tv-border px-3 pb-2 pt-1">
          {layerKeys.map(({ key, i18nKey }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 py-1 text-xs text-tv-text-secondary hover:text-tv-text-primary"
            >
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => onToggle(key)}
                className="sr-only"
                data-testid={`layer-toggle-${key}`}
              />
              {t(i18nKey)}
              <span
                className="ml-auto flex-shrink-0 relative inline-block w-10 h-[16px] rounded-full transition-colors duration-200"
                style={{
                  backgroundColor: layers[key] ? "var(--tv-accent)" : "var(--tv-border)",
                }}
              >
                <span
                  className="absolute top-[2px] h-[12px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{
                    transform: layers[key] ? "translateX(20px)" : "translateX(2px)",
                  }}
                />
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
