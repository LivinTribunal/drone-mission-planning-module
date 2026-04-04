import type { ReactNode } from "react";

interface DetailSelectorItemProps {
  /** whether this item is currently selected. */
  isSelected: boolean;
  /** click handler for selecting this item. */
  onClick: () => void;
  /** prevent interaction when true. */
  disabled?: boolean;
  /** item content. */
  children: ReactNode;
}

export default function DetailSelectorItem({
  isSelected,
  onClick,
  disabled = false,
  children,
}: DetailSelectorItemProps) {
  /** dropdown list item with consistent selected highlight. */
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2.5 transition-colors ${
        isSelected
          ? "bg-tv-accent text-tv-accent-text"
          : "hover:bg-tv-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}
