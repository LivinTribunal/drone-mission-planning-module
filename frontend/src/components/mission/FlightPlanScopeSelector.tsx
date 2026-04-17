import { useTranslation } from "react-i18next";
import type { FlightPlanScope } from "@/types/enums";

interface FlightPlanScopeSelectorProps {
  value: FlightPlanScope;
  onChange: (scope: FlightPlanScope) => void;
  disabled?: boolean;
}

const SCOPES: { value: FlightPlanScope; labelKey: string; descKey: string }[] = [
  { value: "FULL", labelKey: "full", descKey: "fullDescription" },
  { value: "NO_TAKEOFF_LANDING", labelKey: "noTakeoffLanding", descKey: "noTakeoffLandingDescription" },
  { value: "MEASUREMENTS_ONLY", labelKey: "measurementsOnly", descKey: "measurementsOnlyDescription" },
];

export default function FlightPlanScopeSelector({
  value,
  onChange,
  disabled = false,
}: FlightPlanScopeSelectorProps) {
  /** radio group for selecting which waypoint types to include in the flight plan. */
  const { t } = useTranslation();

  return (
    <div data-testid="flight-plan-scope-selector">
      <label className="block text-xs font-medium mb-1.5 text-tv-text-secondary">
        {t("mission.config.flightPlanScope.label")}
      </label>
      <div className="flex flex-col gap-1.5">
        {SCOPES.map((scope) => {
          const selected = value === scope.value;
          return (
            <label
              key={scope.value}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-2xl border transition-colors cursor-pointer ${
                selected
                  ? "border-tv-accent bg-tv-accent/10"
                  : "border-tv-border bg-tv-bg hover:bg-tv-surface-hover"
              } ${disabled ? "pointer-events-none opacity-60" : ""}`}
              data-testid={`scope-option-${scope.value}`}
            >
              <input
                type="radio"
                name="flight_plan_scope"
                value={scope.value}
                checked={selected}
                onChange={() => onChange(scope.value)}
                disabled={disabled}
                className="mt-0.5 accent-[var(--tv-accent)] flex-shrink-0"
              />
              <div>
                <span className={`text-sm font-medium ${selected ? "text-tv-accent" : "text-tv-text-primary"}`}>
                  {t(`mission.config.flightPlanScope.${scope.labelKey}`)}
                </span>
                <p className="text-[11px] text-tv-text-muted leading-tight mt-0.5">
                  {t(`mission.config.flightPlanScope.${scope.descKey}`)}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
