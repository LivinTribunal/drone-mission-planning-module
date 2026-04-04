import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OBSTACLE_COLORS, ObstacleTypeIcon } from "@/components/map/obstacleIcons";
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
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="obstacles-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("airport.obstacles")}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold text-tv-accent-text"
            style={{ backgroundColor: "rgba(59, 187, 59, 0.75)" }}
          >
            {count}
          </span>
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-tv-text-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
          )}
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
                <ObstacleTypeIcon type={obstacle.type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-tv-text-primary truncate">
                      {obstacle.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                      style={{
                        borderColor: OBSTACLE_COLORS[obstacle.type] ?? "#6b6b6b",
                        color: OBSTACLE_COLORS[obstacle.type] ?? "#6b6b6b",
                      }}
                    >
                      {obstacle.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-tv-text-secondary mt-0.5">
                    {t("dashboard.poiHeight")}: {obstacle.height}m
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
