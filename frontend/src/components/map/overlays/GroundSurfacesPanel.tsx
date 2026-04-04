import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
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
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="ground-surfaces-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("airport.groundSurfaces")}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold text-tv-accent-text"
            style={{ backgroundColor: "rgba(59, 187, 59, 0.75)" }}
          >
            {count}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-tv-text-muted transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
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
                      <>
                        <rect x="1" y="0" width="8" height="10" rx="1" fill="currentColor" />
                        <line x1="5" y1="1" x2="5" y2="9" stroke="white" strokeWidth="0.8" strokeDasharray="1.5 1" />
                      </>
                    ) : (
                      <>
                        <rect x="1" y="0" width="8" height="10" rx="1" fill="#c8a83c" />
                        <line x1="5" y1="1" x2="5" y2="9" stroke="#1a1a1a" strokeWidth="0.7" strokeDasharray="1.5 1" />
                      </>
                    )}
                  </svg>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-tv-text-primary truncate">
                        {formatName(surface)}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                        style={{
                          borderColor: surface.surface_type === "RUNWAY" ? "var(--tv-text-muted)" : "var(--tv-accent)",
                          color: surface.surface_type === "RUNWAY" ? "var(--tv-text-muted)" : "var(--tv-accent)",
                        }}
                      >
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
