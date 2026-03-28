import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SurfaceResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";

interface GroundSurfacesPanelProps {
  surfaces: SurfaceResponse[];
  layerConfig: MapLayerConfig;
  onItemClick: (feature: MapFeature) => void;
}

export default function GroundSurfacesPanel({
  surfaces,
  layerConfig,
  onItemClick,
}: GroundSurfacesPanelProps) {
  /** collapsible list of runways and taxiways. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const count = surfaces.length;

  function isGrayedOut(surface: SurfaceResponse): boolean {
    /** check if item should be grayed out based on layer visibility. */
    if (surface.surface_type === "RUNWAY") return !layerConfig.runways;
    if (surface.surface_type === "TAXIWAY") return !layerConfig.taxiways;
    return false;
  }

  function formatName(surface: SurfaceResponse): string {
    /** format display name with RWY/TWY prefix. */
    if (surface.surface_type === "RUNWAY") return `RWY ${surface.identifier}`;
    return `TWY ${surface.identifier}`;
  }

  function handleClick(surface: SurfaceResponse) {
    /** trigger feature selection for a surface. */
    if (isGrayedOut(surface)) return;
    onItemClick({ type: "surface", data: surface });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-surface"
      data-testid="ground-surfaces-panel"
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
            {t("airport.groundSurfaces")}
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
              {t("airport.noSurfaces")}
            </p>
          ) : (
            surfaces.map((surface, idx) => {
              const grayed = isGrayedOut(surface);
              return (
                <button
                  key={surface.id}
                  onClick={() => handleClick(surface)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    grayed
                      ? "opacity-50 pointer-events-none"
                      : "hover:bg-tv-surface-hover cursor-pointer"
                  } ${idx < count - 1 ? "border-b border-tv-border" : ""}`}
                  data-testid={`surface-item-${surface.id}`}
                >
                  {/* type icon */}
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-tv-text-muted" viewBox="0 0 10 10">
                    {surface.surface_type === "RUNWAY" ? (
                      <rect x="1" y="0" width="8" height="10" rx="1" fill="currentColor" />
                    ) : (
                      <rect x="0" y="2" width="10" height="6" rx="1" fill="currentColor" />
                    )}
                  </svg>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-tv-text-primary truncate">
                        {formatName(surface)}
                      </span>
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-tv-bg border border-tv-border text-tv-text-secondary">
                        {surface.surface_type === "RUNWAY" ? t("airport.runway") : t("airport.taxiway")}
                      </span>
                    </div>
                    {surface.length != null && surface.width != null && (
                      <p className="text-[10px] text-tv-text-secondary mt-0.5">
                        {surface.length}m × {surface.width}m
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
