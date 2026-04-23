import { useTranslation } from "react-i18next";
import Input from "@/components/common/Input";
import type { InspectionConfigResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import type { AGLResponse } from "@/types/airport";
import { methodsForAgl } from "@/utils/methodAglCompatibility";
import { formatAglDisplayName } from "@/utils/agl";

interface TemplateConfigSectionProps {
  config: Omit<InspectionConfigResponse, "id"> | null;
  method: string;
  onChange: (field: string, value: number | string | boolean | null) => void;
  onMethodChange: (method: InspectionMethod) => void;
  allAgls: AGLResponse[];
  selectedAglId: string;
  onAglChange: (aglId: string) => void;
  selectedLhaIds: Set<string>;
  onToggleLha: (lhaId: string) => void;
  onSelectAllLhas: () => void;
  onDeselectAllLhas: () => void;
}

export default function TemplateConfigSection({
  config,
  method,
  onChange,
  onMethodChange,
  allAgls,
  selectedAglId,
  onAglChange,
  selectedLhaIds,
  onToggleLha,
  onSelectAllLhas,
  onDeselectAllLhas,
}: TemplateConfigSectionProps) {
  const { t } = useTranslation();

  function handleNumber(field: string, raw: string) {
    const val = raw === "" ? null : parseFloat(raw);
    onChange(field, val);
  }

  const selectedAgl = allAgls.find((a) => a.id === selectedAglId);
  const allLhasSelected = selectedAgl
    ? selectedAgl.lhas.length > 0 && selectedAgl.lhas.every((lha) => selectedLhaIds.has(lha.id))
    : false;

  // methods compatible with the selected AGL type. HOVER_POINT_LOCK is
  // AGL-agnostic so it's the only option when no AGL is picked yet.
  // legacy templates may carry a method that's no longer compatible - keep
  // it in the list so the select can still display its current value.
  const compatMethods: InspectionMethod[] = selectedAgl
    ? methodsForAgl(selectedAgl.agl_type)
    : ["HOVER_POINT_LOCK"];
  const methodOptions = compatMethods.includes(method as InspectionMethod)
    ? compatMethods
    : [...compatMethods, method as InspectionMethod];
  const methodLocked = !selectedAglId && method !== "HOVER_POINT_LOCK";

  return (
    <div className="flex flex-col gap-3">
      {/* agl system dropdown */}
      <div className="relative">
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("coordinator.inspections.selectAglSystem")}
        </label>
        <select
          value={selectedAglId}
          onChange={(e) => onAglChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
        >
          <option value="">{t("coordinator.inspections.selectAgl")}</option>
          {allAgls.map((agl) => (
            <option key={agl.id} value={agl.id}>
              {formatAglDisplayName(agl)}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {/* method dropdown - hidden for hover point lock since it's implicit */}
      {method !== "HOVER_POINT_LOCK" && (
      <div className="relative">
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("coordinator.inspections.method")}
        </label>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value as InspectionMethod)}
          disabled={methodLocked}
          className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {methodOptions.map((m) => (
            <option key={m} value={m}>
              {t(`map.inspectionMethod.${m}`, m)}
            </option>
          ))}
        </select>
        {methodLocked && (
          <p className="text-[11px] text-tv-text-muted mt-1">
            {t("coordinator.inspections.selectAglFirst")}
          </p>
        )}
        <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
      )}

      {/* lha units */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("coordinator.inspections.lhaUnits")}
        </label>
        {!selectedAglId ? (
          <p className="text-sm text-tv-text-muted">
            {t("coordinator.inspections.selectAglFirst")}
          </p>
        ) : selectedAgl && selectedAgl.lhas.length > 0 ? (
          <div className="ml-1">
            {selectedAgl.lhas.length > 1 && (
              <div className="flex gap-2 mb-2">
                <button
                  onClick={allLhasSelected ? onDeselectAllLhas : onSelectAllLhas}
                  className="text-xs text-tv-accent hover:underline"
                >
                  {allLhasSelected
                    ? t("coordinator.inspections.deselectAll")
                    : t("coordinator.inspections.selectAll")}
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {selectedAgl.lhas.map((lha) => (
                <label
                  key={lha.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedLhaIds.has(lha.id)}
                    onChange={() => onToggleLha(lha.id)}
                    className="rounded accent-tv-accent"
                  />
                  <span className="text-tv-text-primary">
                    {t("coordinator.inspections.lhaUnit", { designator: lha.unit_designator })}
                  </span>
                  <span className="text-tv-text-muted text-xs">
                    {lha.setting_angle?.toFixed(2) ?? "-"}&deg;
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-tv-text-muted">
            {t("coordinator.inspections.noAglSystems")}
          </p>
        )}
      </div>

      <Input
        label={t("coordinator.inspections.altitudeOffset")}
        type="number"
        value={config?.altitude_offset ?? ""}
        onChange={(e) => handleNumber("altitude_offset", e.target.value)}
        step="0.1"
      />

      <Input
        label={t("coordinator.inspections.measurementSpeedOverride")}
        type="number"
        value={config?.measurement_speed_override ?? ""}
        onChange={(e) => handleNumber("measurement_speed_override", e.target.value)}
        step="0.1"
      />

      <Input
        label={t("coordinator.inspections.measurementDensity")}
        type="number"
        value={config?.measurement_density ?? ""}
        onChange={(e) => handleNumber("measurement_density", e.target.value)}
        step="1"
      />

      <Input
        label={t("coordinator.inspections.customTolerances")}
        type="number"
        value={config?.custom_tolerances?.default ?? ""}
        onChange={(e) => {
          const val = e.target.value === "" ? null : parseFloat(e.target.value);
          onChange("custom_tolerances", val);
        }}
        step="0.01"
      />

      {method === "VERTICAL_PROFILE" && (
        <Input
          label={t("coordinator.inspections.hoverDuration")}
          type="number"
          value={config?.hover_duration ?? ""}
          onChange={(e) => handleNumber("hover_duration", e.target.value)}
          step="0.5"
        />
      )}

      <Input
        label={t("mission.config.horizontalDistance")}
        type="number"
        value={config?.horizontal_distance ?? ""}
        onChange={(e) => handleNumber("horizontal_distance", e.target.value)}
        step="1"
      />

      {method === "HORIZONTAL_RANGE" && (
        <Input
          label={t("mission.config.sweepAngle")}
          type="number"
          value={config?.sweep_angle ?? ""}
          onChange={(e) => handleNumber("sweep_angle", e.target.value)}
          step="0.5"
        />
      )}

      {method === "HORIZONTAL_RANGE" && selectedAgl && selectedAgl.lhas.length > 0 && (
        <div className="relative">
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.lhaSettingAngleOverride")}
          </label>
          <select
            value={config?.lha_setting_angle_override_id ?? ""}
            onChange={(e) =>
              onChange("lha_setting_angle_override_id", e.target.value || null)
            }
            className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
          >
            <option value="">{t("mission.config.lhaSettingAngleOverrideAuto")}</option>
            {selectedAgl.lhas.map((lha) => (
              <option key={lha.id} value={lha.id}>
                {t("mission.config.unitDesignator")} {lha.unit_designator}
                {lha.setting_angle != null ? ` (${lha.setting_angle}°)` : ""}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
          <p className="text-[11px] text-tv-text-muted mt-1">
            {t("mission.config.lhaSettingAngleOverrideHint")}
          </p>
        </div>
      )}

      {method === "VERTICAL_PROFILE" && (
        <Input
          label={t("mission.config.verticalProfileHeight")}
          type="number"
          value={config?.vertical_profile_height ?? ""}
          onChange={(e) => handleNumber("vertical_profile_height", e.target.value)}
          step="0.5"
        />
      )}

      <Input
        label={t("mission.config.bufferDistanceOverride")}
        type="number"
        value={config?.buffer_distance ?? ""}
        onChange={(e) => handleNumber("buffer_distance", e.target.value)}
        step="0.5"
      />

      {(method === "HORIZONTAL_RANGE" ||
        method === "FLY_OVER" ||
        method === "PARALLEL_SIDE_SWEEP") && (() => {
          const isAuto = config?.direction_is_auto ?? false;
          const isReversed = config?.direction_reversed ?? false;
          const setMode = (mode: "AUTO" | "NATURAL" | "REVERSED") => {
            if (mode === "AUTO") {
              onChange("direction_is_auto", true);
              // reset direction_reversed so the bearing display stays coherent
              // until the optimizer runs and writes back a resolved value.
              onChange("direction_reversed", false);
              return;
            }
            onChange("direction_is_auto", false);
            onChange("direction_reversed", mode === "REVERSED");
          };
          return (
            <div className="flex items-center justify-between gap-3 py-1">
              <label className="block text-xs font-medium text-tv-text-secondary">
                {t("mission.config.direction.label")}
              </label>
              <div
                className="inline-flex rounded-full border border-tv-border bg-tv-bg p-0.5 text-[10px]"
                data-testid="template-direction-mode"
              >
                {([
                  { key: "AUTO", active: isAuto },
                  { key: "NATURAL", active: !isAuto && !isReversed },
                  { key: "REVERSED", active: !isAuto && isReversed },
                ] as const).map(({ key, active }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      active
                        ? "bg-tv-accent text-white font-medium"
                        : "text-tv-text-secondary hover:text-tv-text-primary"
                    }`}
                    data-testid={`template-direction-mode-${key.toLowerCase()}`}
                  >
                    {t(`mission.config.direction.mode.${key.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
