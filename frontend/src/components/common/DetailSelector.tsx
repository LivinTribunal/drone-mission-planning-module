import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  type ElementType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export type ActionVariant = "accent" | "default" | "danger";

export interface DetailSelectorAction {
  /** lucide icon component. */
  icon: ElementType;
  /** click handler. */
  onClick: () => void;
  /** tooltip and aria-label. */
  title: string;
  /** color variant for the icon button. */
  variant?: ActionVariant;
  /** conditionally hide this action. */
  hidden?: boolean;
}

interface DetailSelectorProps {
  /** pill label text in the title bar. */
  title: string;
  /** green count badge number. */
  count: number;
  /** icon buttons shown in the title bar. */
  actions: DetailSelectorAction[];

  /** custom content for the selected item row. */
  renderSelected: () => ReactNode;
  /** whether the dropdown is open (controlled). */
  isOpen: boolean;
  /** toggle dropdown open/close. */
  onToggle: () => void;

  /** inline rename mode. */
  isRenaming?: boolean;
  /** current rename input value. */
  renameValue?: string;
  /** rename input change handler. */
  onRenameChange?: (v: string) => void;
  /** called when rename finishes (enter or blur). */
  onRenameFinish?: () => void;

  /** search input value (controlled). */
  searchValue: string;
  /** search input change handler. */
  onSearchChange: (v: string) => void;
  /** placeholder for the search input. */
  searchPlaceholder: string;
  /** text shown when no items match search. */
  noResultsText: string;
  /** custom list content inside the dropdown. */
  renderDropdownItems: () => ReactNode;

  /** render dropdown via portal to avoid overflow clipping. */
  usePortal?: boolean;
  /** optional css class override for outer container. */
  className?: string;
  /** compact mode - show only the selected item trigger, no title bar. */
  compact?: boolean;
}

const ACTION_VARIANT_CLASSES: Record<ActionVariant, string> = {
  accent:
    "text-tv-accent hover:bg-tv-text-primary/10",
  default:
    "text-tv-text-secondary hover:bg-tv-text-primary/10 hover:text-tv-text-primary",
  danger:
    "text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error",
};

export default function DetailSelector({
  title,
  count,
  actions,
  renderSelected,
  isOpen,
  onToggle,
  isRenaming = false,
  renameValue,
  onRenameChange,
  onRenameFinish,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  noResultsText,
  renderDropdownItems,
  usePortal = false,
  className,
  compact = false,
}: DetailSelectorProps) {
  /** shared entity selector with title bar, action icons, and searchable dropdown. */
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      /** close dropdown on outside click. */
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) &&
          (!portalRef.current || !portalRef.current.contains(target))) {
        onToggle();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onToggle]);

  // close on escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      /** close dropdown on escape key. */
      if (e.key === "Escape") onToggle();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onToggle]);

  // auto-focus search when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // portal positioning
  useLayoutEffect(() => {
    if (!usePortal || !isOpen || !triggerRef.current) {
      setPortalPos(null);
      return;
    }
    function update() {
      /** update portal dropdown position. */
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPortalPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [usePortal, isOpen]);

  const visibleActions = actions.filter((a) => !a.hidden);

  const dropdownContent = (
    <div
      ref={usePortal ? portalRef : undefined}
      className={
        usePortal
          ? "fixed z-50 rounded-2xl border border-tv-border bg-tv-surface"
          : "absolute top-full left-0 right-0 mt-1 rounded-2xl border border-tv-border bg-tv-surface z-50"
      }
      style={usePortal && portalPos ? { top: portalPos.top, left: portalPos.left, width: portalPos.width } : undefined}
    >
      {/* search bar */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tv-text-muted" />
          <input
            ref={searchRef}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
          />
        </div>
      </div>

      {/* item list */}
      <div className="max-h-60 overflow-y-auto">
        {renderDropdownItems() ?? (
          <p className="px-3 py-3 text-xs text-tv-text-muted text-center">
            {noResultsText}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={className ?? "bg-tv-surface border border-tv-border rounded-2xl p-4"}
    >
      {/* title bar - hidden in compact mode */}
      {!compact && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-tv-text-primary flex items-center gap-2">
              <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
                {title}
              </span>
              <span
                className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold bg-tv-accent text-tv-accent-text"
              >
                {count}
              </span>
            </span>

            <div className="flex items-center gap-1.5">
              {visibleActions.map((action) => (
                <button
                  key={action.title}
                  onClick={action.onClick}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    ACTION_VARIANT_CLASSES[action.variant ?? "default"]
                  }`}
                  title={action.title}
                  aria-label={action.title}
                >
                  <action.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* divider */}
          <div className="border-b border-tv-border -mx-4 my-3" />
        </>
      )}

      {/* selected item trigger */}
      <div ref={triggerRef} className="relative">
        <div
          onClick={() => { if (!isRenaming) onToggle(); }}
          className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm cursor-pointer transition-colors border bg-tv-bg ${
            isOpen ? "border-tv-accent" : "border-tv-border hover:bg-tv-surface-hover"
          }`}
        >
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <input
                value={renameValue ?? ""}
                onChange={(e) => onRenameChange?.(e.target.value)}
                onBlur={() => onRenameFinish?.()}
                onKeyDown={(e) => { if (e.key === "Enter") onRenameFinish?.(); }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm font-medium text-tv-text-primary bg-transparent focus:outline-none min-w-0"
                autoFocus
              />
            ) : (
              renderSelected()
            )}
            <ChevronDown
              className={`h-4 w-4 text-tv-text-secondary flex-shrink-0 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>

        {/* dropdown */}
        {isOpen && !usePortal && dropdownContent}
      </div>

      {/* portal dropdown */}
      {isOpen && usePortal && portalPos && createPortal(dropdownContent, document.body)}
    </div>
  );
}
