import type { CSSProperties } from "react";
import type { InspectionMethod } from "@/types/enums";

const METHOD_BADGE_VARS: Record<InspectionMethod, { bg: string; text: string }> = {
  ANGULAR_SWEEP: {
    bg: "var(--tv-method-angular-sweep-bg)",
    text: "var(--tv-method-angular-sweep-text)",
  },
  VERTICAL_PROFILE: {
    bg: "var(--tv-method-vertical-profile-bg)",
    text: "var(--tv-method-vertical-profile-text)",
  },
  FLY_OVER: {
    bg: "var(--tv-method-fly-over-bg)",
    text: "var(--tv-method-fly-over-text)",
  },
  PARALLEL_SIDE_SWEEP: {
    bg: "var(--tv-method-parallel-side-sweep-bg)",
    text: "var(--tv-method-parallel-side-sweep-text)",
  },
  HOVER_POINT_LOCK: {
    bg: "var(--tv-method-hover-point-lock-bg)",
    text: "var(--tv-method-hover-point-lock-text)",
  },
};

export function methodBadgeStyle(method: string): CSSProperties {
  /**get inline styles for an inspection method badge.*/
  const vars = METHOD_BADGE_VARS[method as InspectionMethod];
  if (!vars) return {};
  return { backgroundColor: vars.bg, color: vars.text };
}
