import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ObstacleResponse } from "@/types/airport";
import type { ObstacleType } from "@/types/enums";
import type { MapFeature, MapLayerConfig } from "@/types/map";

const OBSTACLE_COLORS: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

function ObstacleTypeIcon({ type }: { type: ObstacleType }) {
  /** renders per-type svg icon matching legend symbology. */
  const color = OBSTACLE_COLORS[type] ?? "#6b6b6b";

  if (type === "TOWER") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <line x1="3" y1="9" x2="4.5" y2="3.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="7" y1="9" x2="5.5" y2="3.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="6.5" x2="6.5" y2="6.5" stroke={color} strokeWidth="0.5" />
        <line x1="4" y1="3.5" x2="6" y2="3.5" stroke={color} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="5" y1="3.5" x2="5" y2="1" stroke={color} strokeWidth="0.6" strokeLinecap="round" />
        <circle cx="5" cy="1" r="0.5" fill={color} />
      </svg>
    );
  }

  if (type === "ANTENNA") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <line x1="5" y1="9" x2="5" y2="2" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="9" x2="6.5" y2="9" stroke={color} strokeWidth="0.7" strokeLinecap="round" />
        <path d="M3.5,4 A2,2 0 0,1 5,2.5" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M6.5,4 A2,2 0 0,0 5,2.5" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M2.5,5 A3.5,3.5 0 0,1 5,2" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M7.5,5 A3.5,3.5 0 0,0 5,2" fill="none" stroke={color} strokeWidth="0.5" />
        <circle cx="5" cy="2" r="0.5" fill={color} />
      </svg>
    );
  }

  if (type === "VEGETATION") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <rect x="4.2" y="6" width="1.6" height="3" rx="0.3" fill="#8B6914" />
        <polygon points="5,1 7.5,5 2.5,5" fill={color} />
        <polygon points="5,2.5 8,6.5 2,6.5" fill={color} />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
      <polygon points="5,1 9,9 1,9" fill={color} />
    </svg>
  );
}

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
