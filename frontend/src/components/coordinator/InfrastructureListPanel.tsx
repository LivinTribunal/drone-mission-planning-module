import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

interface InfrastructureListPanelProps<T> {
  title: string;
  items: T[];
  getId: (item: T) => string;
  getName: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onAdd?: () => void;
  // single-click on a row: select/edit the item, no map recenter
  onEdit: (item: T) => void;
  // double-click on a row: select AND recenter the map on the item
  onLocate?: (item: T) => void;
  onDelete: (id: string) => void;
  addLabel: string;
  getDeleteWarnings?: (item: T) => string[];
}

export default function InfrastructureListPanel<T>({
  title,
  items,
  getId,
  getName,
  renderItem,
  onAdd,
  onEdit,
  onLocate,
  onDelete,
  addLabel,
  getDeleteWarnings,
}: InfrastructureListPanelProps<T>) {
  /** generic collapsible crud list panel for infrastructure entities. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const count = items.length;

  return (
    <>
      <div
        className="rounded-2xl border border-tv-border bg-tv-bg"
        data-testid={`infra-panel-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex w-full items-center justify-between px-3 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 flex-1"
          >
            <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
              {title}
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
                title={addLabel}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-accent hover:bg-tv-text-primary/10"
                data-testid={`add-${title.toLowerCase().replace(/\s+/g, "-")}`}
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
          <div className="border-t border-tv-border max-h-60 overflow-y-auto">
            {count === 0 ? (
              <p className="px-3 py-3 text-sm italic text-tv-text-muted text-center">
                {t("common.noResults")}
              </p>
            ) : (
              items.map((item, idx) => (
                <div
                  key={getId(item)}
                  onClick={() => onEdit(item)}
                  onDoubleClick={() => onLocate?.(item)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-tv-surface-hover transition-colors ${
                    idx === count - 1 ? "rounded-b-2xl" : "border-b border-tv-border"
                  }`}
                >
                  <div className="flex-1 min-w-0">{renderItem(item)}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error"
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        isOpen={deleteTarget !== null}
        name={deleteTarget ? getName(deleteTarget) : ""}
        warnings={deleteTarget && getDeleteWarnings ? getDeleteWarnings(deleteTarget) : undefined}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(getId(deleteTarget));
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
