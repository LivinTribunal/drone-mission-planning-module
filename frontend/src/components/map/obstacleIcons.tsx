import type { ObstacleType } from "@/types/enums";

export const OBSTACLE_COLORS: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

export function ObstacleTypeIcon({ type }: { type: ObstacleType }) {
  /** renders per-type svg icon matching legend symbology. */
  const color = OBSTACLE_COLORS[type] ?? "#6b6b6b";

  if (type === "TOWER") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <line x1="3" y1="9" x2="4.5" y2="3.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="7" y1="9" x2="5.5" y2="3.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="6.5" x2="6.5" y2="6.5" stroke={color} strokeWidth="0.5" />
        <line x1="4" y1="3.5" x2="6" y2="3.5" stroke={color} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="5" y1="3.5" x2="5" y2="1" stroke={color} strokeWidth="0.6" strokeLinecap="round" />
        <circle cx="5" cy="1" r="0.5" fill={color} />
      </svg>
    );
  }

  if (type === "ANTENNA") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <line x1="5" y1="9" x2="5" y2="2" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="9" x2="6.5" y2="9" stroke={color} strokeWidth="0.7" strokeLinecap="round" />
        <path d="M3.5,4 A2,2 0 0,1 5,2.5" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M6.5,4 A2,2 0 0,0 5,2.5" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M2.5,5 A3.5,3.5 0 0,1 5,2" fill="none" stroke={color} strokeWidth="0.5" />
        <path d="M7.5,5 A3.5,3.5 0 0,0 5,2" fill="none" stroke={color} strokeWidth="0.5" />
        <circle cx="5" cy="2" r="0.5" fill={color} />
      </svg>
    );
  }

  if (type === "VEGETATION") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <rect x="4.2" y="6" width="1.6" height="3" rx="0.3" fill="#8B6914" />
        <polygon points="5,1 7.5,5 2.5,5" fill={color} />
        <polygon points="5,2.5 8,6.5 2,6.5" fill={color} />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
      <polygon points="5,1 9,9 1,9" fill={color} />
    </svg>
  );
}
