import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { AGLResponse, LHAResponse, SurfaceResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";

interface AGLPanelProps {
  surfaces: SurfaceResponse[];
  layerConfig: MapLayerConfig;
  onItemClick: (feature: MapFeature) => void;
}

export default function AGLPanel({
  surfaces,
  layerConfig,
  onItemClick,
}: AGLPanelProps) {
  /** collapsible list of agl systems with expandable lha sub-items. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedAgls, setExpandedAgls] = useState<Set<string>>(new Set());

  const allAgls = surfaces.flatMap((s) => s.agls);
  const count = allAgls.length;
  const grayed = !layerConfig.aglSystems;

  function toggleExpand(aglId: string) {
    /** toggle expand/collapse state for an agl item. */
    setExpandedAgls((prev) => {
      const next = new Set(prev);
      if (next.has(aglId)) {
        next.delete(aglId);
      } else {
        next.add(aglId);
      }
      return next;
    });
  }

  function handleAglClick(agl: AGLResponse) {
    /** trigger feature selection for an agl system. */
    if (grayed) return;
    onItemClick({ type: "agl", data: agl });
  }

  function handleLhaClick(lha: LHAResponse, e: React.MouseEvent) {
    /** trigger feature selection for an lha unit. */
    e.stopPropagation();
    if (grayed) return;
    onItemClick({ type: "lha", data: lha });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="agl-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("airport.aglSystems")}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold bg-tv-accent text-tv-accent-text"
          >
            {count}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-tv-text-muted transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border max-h-60 overflow-y-auto">
          {count === 0 ? (
            <p className="px-3 py-3 text-sm italic text-tv-text-muted text-center">
              {t("airport.noAglSystems")}
            </p>
          ) : (
            allAgls.map((agl, idx) => {
              const expanded = expandedAgls.has(agl.id);
              return (
                <div
                  key={agl.id}
                  className={idx < count - 1 ? "border-b border-tv-border" : ""}
                >
                  <button
                    onClick={() => {
                      handleAglClick(agl);
                      toggleExpand(agl.id);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      grayed
                        ? "opacity-50 pointer-events-none"
                        : "hover:bg-tv-surface-hover cursor-pointer"
                    }`}
                    data-testid={`agl-item-${agl.id}`}
                  >
                    {/* magenta circle icon */}
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "#e91e90" }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-tv-text-primary truncate">
                          {agl.name}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                          style={{ borderColor: "#e91e90", color: "#e91e90" }}
                        >
                          {agl.agl_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {agl.side && (
                          <span className="text-[10px] text-tv-text-secondary">
                            {agl.side}
                          </span>
                        )}
                        <span className="text-[10px] text-tv-text-secondary">
                          {agl.lhas.length} {t("airport.units")}
                        </span>
                      </div>
                    </div>

                    {agl.lhas.length > 0 && (
                      <ChevronDown className={`h-3 w-3 text-tv-text-muted flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                    )}
                  </button>

                  {/* lha sub-items */}
                  {expanded && agl.lhas.length > 0 && (
                    <div className="bg-tv-bg">
                      {agl.lhas.map((lha, lhaIdx) => (
                        <button
                          key={lha.id}
                          onClick={(e) => handleLhaClick(lha, e)}
                          className={`flex w-full items-center gap-2 pl-8 pr-3 py-2 text-left transition-colors ${
                            grayed
                              ? "opacity-50 pointer-events-none"
                              : "hover:bg-tv-surface-hover cursor-pointer"
                          } ${lhaIdx < agl.lhas.length - 1 ? "border-b border-tv-border" : ""}`}
                          data-testid={`lha-item-${lha.id}`}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "#e91e90" }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-tv-text-primary">
                              {t("airport.lhaUnit", { number: lha.unit_number })}
                            </span>
                            <span className="text-xs text-tv-text-secondary ml-2">
                              {lha.setting_angle}°
                            </span>
                            <p className="text-[10px] text-tv-text-muted mt-0.5">
                              {lha.position.coordinates[1].toFixed(4)}, {lha.position.coordinates[0].toFixed(4)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
