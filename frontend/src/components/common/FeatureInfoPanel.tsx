import type { ReactNode } from "react";

interface FeatureInfoPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

/** shared info panel with title badge, close button, and content area. */
export default function FeatureInfoPanel({
  title,
  onClose,
  children,
  actions,
}: FeatureInfoPanelProps) {
  return (
    <div className="rounded-2xl border border-tv-border bg-tv-bg">
      <div className="flex items-center justify-between p-3 pb-0">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {title}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-tv-text-muted hover:text-tv-text-primary transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="p-3">{children}</div>
      {actions && (
        <div className="px-3 pb-3 flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
