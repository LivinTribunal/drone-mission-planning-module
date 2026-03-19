import { useState, useRef, useEffect, type ReactNode } from "react";

interface DropdownItem {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

interface DropdownProps {
  trigger: string;
  items: DropdownItem[];
  className?: string;
}

export default function Dropdown({ trigger, items, className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium
          bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
      >
        {trigger}
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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

      {open && (
        <div
          className="absolute right-0 top-full mt-1 min-w-[180px] rounded-2xl border
            border-tv-border bg-tv-surface p-2 z-50"
        >
          {items.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
              className={`block w-full text-left rounded-xl px-4 py-2.5 text-sm transition-colors
                ${item.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-tv-surface-hover"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
