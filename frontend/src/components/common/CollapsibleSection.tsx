import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  count?: number;
  headerRight?: ReactNode;
  badges?: ReactNode;
  compact?: boolean;
}

/** collapsible card with title badge, optional count, and chevron rotation. */
export default function CollapsibleSection({
  title,
  children,
  defaultExpanded = true,
  count,
  headerRight,
  badges,
  compact = false,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-tv-surface border border-tv-border rounded-3xl">
      <div
        className={`flex w-full items-center gap-2 ${compact ? "p-3" : "p-4"}`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-left"
          data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <span
            className={`font-semibold text-tv-text-primary rounded-full px-3 py-1 bg-tv-bg border border-tv-border ${compact ? "text-xs" : "text-base"}`}
          >
            {title}
          </span>
          {count != null && (
            <span
              className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-tv-accent-text"
              style={{ backgroundColor: "rgba(59, 187, 59, 0.75)" }}
            >
              {count}
            </span>
          )}
          {badges}
        </button>
        {headerRight && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </div>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0"
        >
          <svg
            className={`h-5 w-5 text-tv-text-secondary transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className={`${compact ? "px-3 pb-3" : "px-4 pb-4"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
