import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Trash2, Eye, EyeOff, Plus, ChevronDown } from "lucide-react";
import type { InspectionResponse } from "@/types/mission";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";

interface InspectionListProps {
  inspections: InspectionResponse[];
  templates: Map<string, InspectionTemplateResponse>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (ids: string[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  isDraft: boolean;
  canReorder: boolean;
  visibleIds: Set<string>;
  onToggleVisibility: (id: string) => void;
}

export default function InspectionList({
  inspections,
  templates,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
  isDraft,
  canReorder,
  visibleIds,
  onToggleVisibility,
}: InspectionListProps) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const sorted = [...inspections].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );

  const canAdd = isDraft && inspections.length < 10;
  const addTooltip = !isDraft
    ? t("mission.config.addDisabledNotDraft")
    : inspections.length >= 10
      ? t("mission.config.addDisabledMaxReached")
      : undefined;

  function handleDragStart(e: React.DragEvent, idx: number) {
    if (!canReorder) {
      e.preventDefault();
      return;
    }
    setDragIdx(idx);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = "move";
    // make the dragged element semi-transparent after a tick
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx === null || idx === dragIdx) {
      setDropIdx(null);
      return;
    }
    setDropIdx(idx);
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      resetDrag();
      return;
    }

    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onReorder(reordered.map((insp) => insp.id));
    resetDrag();
  }

  function resetDrag() {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragNode.current = null;
    setDragIdx(null);
    setDropIdx(null);
  }

  return (
    <div>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-sm font-semibold text-tv-text-primary flex items-center gap-2">
          <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
            {t("mission.config.inspections")}
          </span>
          <span
            className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold bg-tv-accent text-tv-accent-text"
          >
            {inspections.length}/10
          </span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={!canAdd}
            title={addTooltip}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              canAdd
                ? "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover"
                : "border border-tv-border bg-tv-surface text-tv-text-muted opacity-50 cursor-not-allowed"
            }`}
            data-testid="add-inspection-btn"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("mission.config.addInspection")}
          </button>
          <ChevronDown className={`h-4 w-4 text-tv-text-primary transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </div>
      </div>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && sorted.length === 0 && (
        <p className="text-sm text-tv-text-muted py-4 text-center">
          {t("mission.config.noInspectionSelected")}
        </p>
      )}

      {!collapsed && (
      <div className="space-y-1 mt-2">
        {sorted.map((insp, idx) => {
          const template = templates.get(insp.template_id);
          const isSelected = selectedId === insp.id;
          const isVisible = visibleIds.has(insp.id);
          const isDropTarget = dropIdx === idx && dragIdx !== idx;

          return (
            <div key={insp.id}>
              {/* drop indicator line - above */}
              {isDropTarget && dragIdx !== null && dragIdx > idx && (
                <div className="h-0.5 bg-tv-accent rounded-full mx-3 -mb-0.5" />
              )}
              <div
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={resetDrag}
                onClick={() => onSelect(isSelected ? null : insp.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-sm cursor-pointer transition-colors border ${
                  isSelected
                    ? "border-tv-accent bg-tv-surface"
                    : "border-transparent hover:bg-tv-surface-hover"
                }`}
                data-testid={`inspection-row-${insp.id}`}
              >
                {canReorder && (
                  <GripVertical className="h-4 w-4 text-tv-text-muted flex-shrink-0 cursor-grab" />
                )}

                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-accent/20 text-tv-accent text-xs font-semibold flex-shrink-0">
                  {idx + 1}
                </span>

                <span className="flex-1 text-tv-text-primary truncate">
                  {template?.name ?? insp.template_id.slice(0, 8)}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(insp.id);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-tv-text-primary/10"
                  title={t("mission.config.visible")}
                  data-testid={`toggle-visibility-${insp.id}`}
                >
                  {isVisible ? (
                    <Eye className="h-4 w-4 text-tv-accent" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-tv-text-muted" />
                  )}
                </button>

                {isDraft && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(insp.id);
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error"
                    title={t("mission.config.removeInspection")}
                    data-testid={`remove-inspection-${insp.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* drop indicator line - below */}
              {isDropTarget && dragIdx !== null && dragIdx < idx && (
                <div className="h-0.5 bg-tv-accent rounded-full mx-3 -mt-0.5" />
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
