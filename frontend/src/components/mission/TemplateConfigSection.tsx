import { useTranslation } from "react-i18next";
import Input from "@/components/common/Input";
import type { InspectionConfigResponse } from "@/types/inspectionTemplate";

interface TemplateConfigSectionProps {
  config: Omit<InspectionConfigResponse, "id"> | null;
  method: string;
  isEditing: boolean;
  onChange: (field: string, value: number | null) => void;
}

export default function TemplateConfigSection({
  config,
  method,
  isEditing,
  onChange,
}: TemplateConfigSectionProps) {
  const { t } = useTranslation();

  function formatMethod(m: string) {
    if (m === "ANGULAR_SWEEP") return t("coordinator.inspections.angularSweep");
    if (m === "VERTICAL_PROFILE") return t("coordinator.inspections.verticalProfile");
    return m;
  }

  function handleNumber(field: string, raw: string) {
    const val = raw === "" ? null : parseFloat(raw);
    onChange(field, val);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("coordinator.inspections.method")}
        </label>
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tv-status-planned-bg)] text-[var(--tv-status-planned-text)]">
          {formatMethod(method)}
        </span>
      </div>

      <Input
        label={t("coordinator.inspections.altitudeOffset")}
        type="number"
        value={config?.altitude_offset ?? ""}
        onChange={(e) => handleNumber("altitude_offset", e.target.value)}
        disabled={!isEditing}
        step="0.1"
      />

      <Input
        label={t("coordinator.inspections.speed")}
        type="number"
        value={config?.speed_override ?? ""}
        onChange={(e) => handleNumber("speed_override", e.target.value)}
        disabled={!isEditing}
        step="0.1"
      />

      <Input
        label={t("coordinator.inspections.measurementDensity")}
        type="number"
        value={config?.measurement_density ?? ""}
        onChange={(e) => handleNumber("measurement_density", e.target.value)}
        disabled={!isEditing}
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
        disabled={!isEditing}
        step="0.01"
      />

      {method === "VERTICAL_PROFILE" && (
        <Input
          label={t("coordinator.inspections.hoverDuration")}
          type="number"
          value={config?.hover_duration ?? ""}
          onChange={(e) => handleNumber("hover_duration", e.target.value)}
          disabled={!isEditing}
          step="0.5"
        />
      )}
    </div>
  );
}
