import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";

export interface RowAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface RowActionMenuProps {
  actions: RowAction[];
}

export default function RowActionMenu({ actions }: RowActionMenuProps) {
  /** three-dot menu for table row actions. */
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="rounded-full p-1.5 text-tv-text-secondary hover:bg-tv-surface-hover hover:text-tv-text-primary transition-colors"
        data-testid="row-action-trigger"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded-2xl border border-tv-border bg-tv-surface p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                action.variant === "danger"
                  ? "text-tv-error hover:bg-tv-surface-hover"
                  : "text-tv-text-primary hover:bg-tv-surface-hover"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
