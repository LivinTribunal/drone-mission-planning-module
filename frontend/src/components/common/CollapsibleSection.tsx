import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  count?: number;
}

export default function CollapsibleSection({
  title,
  children,
  defaultExpanded = true,
  count,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-tv-surface border border-tv-border rounded-3xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-4 text-left"
        data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="flex-1 text-base font-semibold text-tv-text-primary rounded-full px-3 py-1 bg-tv-section-label-bg">
          {title}
        </span>
        {count != null && (
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 rounded-full px-2 text-xs font-semibold bg-tv-accent/20 text-tv-accent">
            {count}
          </span>
        )}
        <svg
          className={`h-5 w-5 flex-shrink-0 text-tv-text-secondary transition-transform duration-200 ${
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
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
