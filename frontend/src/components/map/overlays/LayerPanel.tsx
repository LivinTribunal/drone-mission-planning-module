import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Flag } from "lucide-react";
import type { MapLayerConfig } from "@/types/map";

interface LayerPanelProps {
  layers: MapLayerConfig;
  onToggle: (key: string) => void;
  hasWaypoints?: boolean;
  hasSimplifiedTrajectory?: boolean;
  hasTakeoffLanding?: boolean;
  hasTakeoff?: boolean;
  hasLanding?: boolean;
  onPlaceTakeoff?: () => void;
  onPlaceLanding?: () => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  /** custom toggle switch. */
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="ml-auto flex-shrink-0 relative inline-block w-[36px] h-[18px] rounded-full transition-colors duration-200"
      style={{
        backgroundColor: checked ? "var(--tv-accent)" : "var(--tv-border)",
      }}
    >
      <span
        className="absolute top-[3px] left-[3px] h-[12px] w-[12px] rounded-full bg-white transition-transform duration-200"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(0px)",
        }}
      />
    </button>
  );
}

const baseLayerKeys: { key: keyof MapLayerConfig; i18nKey: string }[] = [
  { key: "runways", i18nKey: "dashboard.runways" },
  { key: "taxiways", i18nKey: "dashboard.taxiways" },
  { key: "safetyZones", i18nKey: "dashboard.safetyZones" },
  { key: "obstacles", i18nKey: "dashboard.obstacles" },
  { key: "aglSystems", i18nKey: "dashboard.aglSystems" },
];

export default function LayerPanel({
  layers,
  onToggle,
  hasWaypoints,
  hasSimplifiedTrajectory,
  hasTakeoffLanding,
  hasTakeoff,
  hasLanding,
  onPlaceTakeoff,
  onPlaceLanding,
}: LayerPanelProps) {
  /** hierarchical layer visibility toggle panel. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [trajectoryExpanded, setTrajectoryExpanded] = useState(layers.trajectory);
  const [waypointsExpanded, setWaypointsExpanded] = useState(true);

  const waypointsOn = layers.transitWaypoints && layers.measurementWaypoints;

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg min-w-[260px] flex-shrink-0"
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
          {/* base infrastructure layers */}
          {baseLayerKeys.map(({ key, i18nKey }) => (
            <div key={key} className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
              <span>{t(i18nKey)}</span>
              <Toggle checked={layers[key]} onChange={() => onToggle(key)} />
            </div>
          ))}

          {/* simplified trajectory */}
          {hasSimplifiedTrajectory && (
            <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
              <span>{t("map.simplifiedTrajectory")}</span>
              <Toggle checked={layers.simplifiedTrajectory} onChange={() => onToggle("simplifiedTrajectory")} />
            </div>
          )}

          {/* trajectory parent */}
          {hasWaypoints && (
            <>
              <div className="flex items-center gap-1 py-1 text-xs text-tv-text-secondary">
                <button
                  onClick={() => setTrajectoryExpanded(!trajectoryExpanded)}
                  className="p-0.5 -ml-0.5"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${trajectoryExpanded ? "" : "-rotate-90"}`} />
                </button>
                <span>{t("map.trajectory")}</span>
                <Toggle checked={layers.trajectory} onChange={() => onToggle("trajectory")} />
              </div>

              {trajectoryExpanded && (
                <div className="pl-4">
                  {/* waypoints sub-parent */}
                  <div className="flex items-center gap-1 py-1 text-xs text-tv-text-secondary">
                    <button
                      onClick={() => setWaypointsExpanded(!waypointsExpanded)}
                      className="p-0.5 -ml-0.5"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${waypointsExpanded ? "" : "-rotate-90"}`} />
                    </button>
                    <span>{t("dashboard.waypoints")}</span>
                    <Toggle checked={waypointsOn} onChange={() => onToggle("waypoints")} />
                  </div>

                  {waypointsExpanded && (
                    <div className="pl-4">
                      <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                        <span>{t("map.transitWaypoints")}</span>
                        <Toggle checked={layers.transitWaypoints} onChange={() => onToggle("transitWaypoints")} />
                      </div>
                      <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                        <span>{t("map.measurementWaypoints")}</span>
                        <Toggle checked={layers.measurementWaypoints} onChange={() => onToggle("measurementWaypoints")} />
                      </div>
                    </div>
                  )}

                  {/* path */}
                  <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                    <span>{t("map.path")}</span>
                    <Toggle checked={layers.path} onChange={() => onToggle("path")} />
                  </div>

                  {/* takeoff & landing */}
                  <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                    <span>{t("map.takeoffLanding")}</span>
                    <Toggle checked={layers.takeoffLanding} onChange={() => onToggle("takeoffLanding")} />
                  </div>

                  {/* camera heading */}
                  <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                    <span>{t("map.cameraHeading")}</span>
                    <Toggle checked={layers.cameraHeading} onChange={() => onToggle("cameraHeading")} />
                  </div>

                  {/* path heading */}
                  <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
                    <span>{t("map.pathHeading")}</span>
                    <Toggle checked={layers.pathHeading} onChange={() => onToggle("pathHeading")} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* standalone takeoff & landing toggle - when no trajectory but markers exist */}
          {!hasWaypoints && hasTakeoffLanding && (
            <div className="flex items-center gap-2 py-1 text-xs text-tv-text-secondary">
              <span>{t("map.takeoffLanding")}</span>
              <Toggle checked={layers.takeoffLanding} onChange={() => onToggle("takeoffLanding")} />
            </div>
          )}

          {/* placement buttons */}
          {!hasTakeoff && onPlaceTakeoff && (
            <button
              onClick={onPlaceTakeoff}
              className="flex items-center gap-2 w-full mt-2 rounded-full px-3 py-1.5 text-xs font-semibold bg-tv-success/10 border border-tv-success text-tv-success hover:bg-tv-success/20 transition-colors"
              data-testid="place-takeoff-btn"
            >
              <Flag className="h-3.5 w-3.5" />
              {t("map.placeTakeoff")}
            </button>
          )}
          {!hasLanding && onPlaceLanding && (
            <button
              onClick={onPlaceLanding}
              className="flex items-center gap-2 w-full mt-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-tv-error/10 border border-tv-error text-tv-error hover:bg-tv-error/20 transition-colors"
              data-testid="place-landing-btn"
            >
              <Flag className="h-3.5 w-3.5" />
              {t("map.placeLanding")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
