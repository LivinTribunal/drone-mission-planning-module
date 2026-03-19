import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-tv-surface border border-tv-border rounded-2xl p-4 ${className}`}
    >
      {children}
    </div>
  );
}
