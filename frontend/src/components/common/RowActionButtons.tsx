import type { LucideIcon } from "lucide-react";

interface RowAction {
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  title?: string;
}

interface RowActionButtonsProps {
  actions: RowAction[];
}

/** inline row action icon buttons with hover circles. */
export default function RowActionButtons({ actions }: RowActionButtonsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {actions.map((action, idx) => {
        const Icon = action.icon;
        const isDanger = action.variant === "danger";
        return (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              if (!action.disabled) action.onClick();
            }}
            disabled={action.disabled}
            title={action.title}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              action.disabled
                ? "opacity-40 cursor-not-allowed"
                : isDanger
                  ? "text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error"
                  : "text-tv-text-secondary hover:bg-tv-text-primary/10 hover:text-tv-text-primary"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
