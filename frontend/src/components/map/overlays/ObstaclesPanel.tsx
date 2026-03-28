import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ObstacleResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";

interface ObstaclesPanelProps {
  obstacles: ObstacleResponse[];
  layerConfig: MapLayerConfig;
  onItemClick: (feature: MapFeature) => void;
}

export default function ObstaclesPanel({
  obstacles,
  layerConfig,
  onItemClick,
}: ObstaclesPanelProps) {
  /** collapsible list of airport obstacles. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const count = obstacles.length;
  const grayed = !layerConfig.obstacles;

  function handleClick(obstacle: ObstacleResponse) {
    /** trigger feature selection for an obstacle. */
    if (grayed) return;
    onItemClick({ type: "obstacle", data: obstacle });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-surface"
      data-testid="obstacles-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-tv-text-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
          )}
          <span className="text-xs font-semibold text-tv-text-primary">
            {t("airport.obstacles")}
          </span>
          <span className="rounded-full bg-tv-bg px-2 py-0.5 text-[10px] font-medium text-tv-text-secondary border border-tv-border">
            {count}
          </span>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border">
          {count === 0 ? (
            <p className="px-3 py-3 text-sm italic text-tv-text-muted text-center">
              {t("airport.noObstacles")}
            </p>
          ) : (
            obstacles.map((obstacle, idx) => (
              <button
                key={obstacle.id}
                onClick={() => handleClick(obstacle)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  grayed
                    ? "opacity-50 pointer-events-none"
                    : "hover:bg-tv-surface-hover cursor-pointer"
                } ${idx < count - 1 ? "border-b border-tv-border" : ""}`}
                data-testid={`obstacle-item-${obstacle.id}`}
              >
                {/* red triangle icon */}
                <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
                  <polygon points="5,1 9,9 1,9" fill="#e54545" />
                </svg>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-tv-text-primary truncate">
                      {obstacle.name}
                    </span>
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-tv-bg border border-tv-border text-tv-text-secondary">
                      {obstacle.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-tv-text-secondary mt-0.5">
                    {obstacle.height}m
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
