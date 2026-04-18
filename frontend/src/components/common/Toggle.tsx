interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}

/** custom toggle switch. */
export default function Toggle({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: ToggleProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      className="ml-auto flex-shrink-0 relative inline-block w-[36px] h-[18px] rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: checked ? "var(--tv-accent)" : "var(--tv-border)",
      }}
    >
      <span
        className="absolute top-[3px] left-[3px] h-[12px] w-[12px] rounded-full bg-white transition-transform duration-200"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(0px)",
        }}
      />
    </button>
  );
}
