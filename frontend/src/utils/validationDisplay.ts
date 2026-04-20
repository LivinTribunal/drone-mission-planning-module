import { ShieldCheck, ShieldAlert, type LucideIcon } from "lucide-react";
import type { ValidationResultResponse } from "@/types/flightPlan";

export interface ValidationDisplay {
  value: string;
  icon: LucideIcon;
  colorClass: string;
}

export function getValidationDisplay(
  validationResult: ValidationResultResponse | null | undefined,
  labels: {
    passed: string;
    notPassed: string;
    notRun: string;
    violation: (count: number) => string;
    warning: (count: number) => string;
  },
): ValidationDisplay {
  if (!validationResult) {
    return {
      value: labels.notRun,
      icon: ShieldCheck,
      colorClass: "bg-tv-text-muted/20 text-tv-text-muted",
    };
  }

  const violations = validationResult.violations.filter((v) => v.category === "violation");
  const warnings = validationResult.violations.filter((v) => v.category === "warning");

  if (validationResult.passed && violations.length === 0) {
    return {
      value: labels.passed,
      icon: ShieldCheck,
      colorClass: "bg-tv-success/20 text-tv-success",
    };
  }

  const parts: string[] = [];
  if (violations.length > 0) parts.push(`${violations.length} ${labels.violation(violations.length)}`);
  if (warnings.length > 0) parts.push(`${warnings.length} ${labels.warning(warnings.length)}`);

  return {
    value: parts.join(", ") || labels.notPassed,
    icon: ShieldAlert,
    colorClass: "bg-tv-error/20 text-tv-error",
  };
}
