import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover rounded-full",
  secondary:
    "bg-transparent text-tv-text-primary border border-tv-border hover:bg-tv-surface-hover rounded-full",
  danger: "bg-tv-error text-white hover:opacity-90 rounded-full",
  icon: "bg-transparent text-tv-text-primary border border-tv-border hover:bg-tv-surface-hover rounded-full aspect-square",
};

export default function Button({
  variant = "primary",
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`px-4 py-2.5 text-sm font-semibold transition-colors ${variantStyles[variant]} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
