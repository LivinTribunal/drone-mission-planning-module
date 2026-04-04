import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ChevronUp, Trash2, Plus } from "lucide-react";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import type { AGLResponse, LHAResponse, SurfaceResponse } from "@/types/airport";
import type { MapFeature } from "@/types/map";

interface CoordinatorAGLPanelProps {
  surfaces: SurfaceResponse[];
  onItemClick: (feature: MapFeature) => void;
  onDeleteAgl: (id: string) => void;
  onAdd?: () => void;
}

export default function CoordinatorAGLPanel({
  surfaces,
  onItemClick,
  onDeleteAgl,
  onAdd,
}: CoordinatorAGLPanelProps) {
  /** collapsible agl list with expandable lha sub-items and delete support. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedAgls, setExpandedAgls] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AGLResponse | null>(null);

  const allAgls = surfaces.flatMap((s) => s.agls);
  const count = allAgls.length;

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
    onItemClick({ type: "agl", data: agl });
  }

  function handleLhaClick(lha: LHAResponse, e: React.MouseEvent) {
    /** trigger feature selection for an lha unit. */
    e.stopPropagation();
    onItemClick({ type: "lha", data: lha });
  }

  return (
    <>
      <div
        className="rounded-2xl border border-tv-border bg-tv-bg"
        data-testid="coordinator-agl-panel"
      >
        <div className="flex w-full items-center justify-between px-3 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 flex-1"
          >
            <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
              {t("airport.aglSystems")}
            </span>
            <span
              className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold text-tv-accent-text"
              style={{ backgroundColor: "color-mix(in srgb, var(--tv-accent) 75%, transparent)" }}
            >
              {count}
            </span>
          </button>
          <div className="flex items-center gap-1">
            {onAdd && (
              <button
                onClick={onAdd}
                title={t("coordinator.detail.addAgl")}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-accent hover:bg-tv-text-primary/10"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-tv-text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
              )}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="border-t border-tv-border">
            {count === 0 ? (
              <p className="px-3 py-3 text-sm italic text-tv-text-muted text-center">
                {t("common.noResults")}
              </p>
            ) : (
              allAgls.map((agl, idx) => {
                const expanded = expandedAgls.has(agl.id);
                return (
                  <div
                    key={agl.id}
                    className={idx < count - 1 ? "border-b border-tv-border" : ""}
                  >
                    <div
                      onClick={() => {
                        handleAglClick(agl);
                        toggleExpand(agl.id);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 cursor-pointer hover:bg-tv-surface-hover transition-colors ${
                        idx === count - 1 && !expanded ? "rounded-b-2xl" : ""
                      }`}
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
                        expanded ? (
                          <ChevronUp className="h-3 w-3 text-tv-text-muted flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-tv-text-muted flex-shrink-0" />
                        )
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(agl); }}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error"
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* lha sub-items */}
                    {expanded && agl.lhas.length > 0 && (
                      <div className="bg-tv-bg">
                        {agl.lhas.map((lha, lhaIdx) => (
                          <button
                            key={lha.id}
                            onClick={(e) => handleLhaClick(lha, e)}
                            className={`flex w-full items-center gap-2 pl-8 pr-3 py-2 text-left transition-colors hover:bg-tv-surface-hover cursor-pointer ${
                              lhaIdx < agl.lhas.length - 1 ? "border-b border-tv-border" : ""
                            } ${lhaIdx === agl.lhas.length - 1 && idx === count - 1 ? "rounded-b-2xl" : ""}`}
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

      <ConfirmDeleteDialog
        isOpen={deleteTarget !== null}
        name={deleteTarget?.name ?? ""}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteAgl(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
