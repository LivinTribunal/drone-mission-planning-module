import { useTranslation } from "react-i18next";
import Input from "@/components/common/Input";
import type { InspectionConfigResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import type { AGLResponse } from "@/types/airport";

interface TemplateConfigSectionProps {
  config: Omit<InspectionConfigResponse, "id"> | null;
  method: string;
  onChange: (field: string, value: number | null) => void;
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
              {agl.name} - {agl.agl_type}{agl.side ? ` - ${agl.side}` : ""}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {/* method dropdown */}
      <div className="relative">
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("coordinator.inspections.method")}
        </label>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value as InspectionMethod)}
          className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
        >
          <option value="ANGULAR_SWEEP">{t("coordinator.inspections.angularSweep")}</option>
          <option value="VERTICAL_PROFILE">{t("coordinator.inspections.verticalProfile")}</option>
        </select>
        <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

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
                    {t("coordinator.inspections.lhaUnit", { number: lha.unit_number })}
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
        label={t("coordinator.inspections.speed")}
        type="number"
        value={config?.speed_override ?? ""}
        onChange={(e) => handleNumber("speed_override", e.target.value)}
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
    </div>
  );
}
