import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { InspectionResponse, InspectionConfigOverride } from "@/types/mission";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { AGLResponse } from "@/types/airport";
import type { CaptureMode } from "@/types/enums";

interface InspectionConfigFormProps {
  inspection: InspectionResponse;
  template: InspectionTemplateResponse | null;
  agls: AGLResponse[];
  droneProfile: DroneProfileResponse | null;
  configOverride: InspectionConfigOverride;
  onChange: (override: InspectionConfigOverride) => void;
  selectedLhaIds: Set<string>;
  onToggleLha: (lhaId: string) => void;
}

export default function InspectionConfigForm({
  inspection,
  template,
  agls,
  droneProfile,
  configOverride,
  onChange,
  selectedLhaIds,
  onToggleLha,
}: InspectionConfigFormProps) {
  const { t } = useTranslation();

  // resolve values: dirty override > saved config > template defaults
  const savedCfg = inspection.config;
  const defaultCfg = template?.default_config;

  const altitudeOffset =
    configOverride.altitude_offset ?? savedCfg?.altitude_offset ?? defaultCfg?.altitude_offset ?? "";
  const speedOverride =
    configOverride.speed_override ?? savedCfg?.speed_override ?? defaultCfg?.speed_override ?? "";
  const measurementDensity =
    configOverride.measurement_density ?? savedCfg?.measurement_density ?? defaultCfg?.measurement_density ?? "";
  const hoverDuration =
    configOverride.hover_duration ?? savedCfg?.hover_duration ?? defaultCfg?.hover_duration ?? "";
  const captureMode =
    configOverride.capture_mode !== undefined
      ? configOverride.capture_mode
      : savedCfg?.capture_mode ?? defaultCfg?.capture_mode ?? null;
  const recordingSetupDuration =
    configOverride.recording_setup_duration ?? savedCfg?.recording_setup_duration ?? defaultCfg?.recording_setup_duration ?? "";

  // effective capture mode for conditional display
  const effectiveCaptureMode = captureMode ?? "VIDEO_CAPTURE";

  // speed/framerate warning - checks max_speed since path_distance is not available here
  const speedWarning = useMemo(() => {
    const speed = configOverride.speed_override ?? savedCfg?.speed_override ?? defaultCfg?.speed_override;
    if (!speed || !droneProfile) return false;

    if (droneProfile.max_speed && speed > droneProfile.max_speed) {
      return true;
    }
    return false;
  }, [configOverride, savedCfg, defaultCfg, droneProfile]);

  // find target AGLs for this template
  const targetAgls = useMemo(() => {
    if (!template?.target_agl_ids?.length) return agls;
    return agls.filter((a) => template.target_agl_ids.includes(a.id));
  }, [agls, template]);

  function handleNumberChange(
    field: keyof InspectionConfigOverride,
    raw: string,
  ) {
    const val = raw === "" ? null : parseFloat(raw);
    onChange({ ...configOverride, [field]: val });
  }

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="inspection-config-form">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.config.inspectionConfig")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && (
      <div className="space-y-4 mt-3">

      {/* read-only fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.templateName")}
          </label>
          <p className="text-sm text-tv-text-primary">
            {template?.name ?? "-"}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.method")}
          </label>
          <p className="text-sm text-tv-text-primary">
            {inspection.method.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* agl / lha selection */}
      {targetAgls.length > 0 && (
        <div>
          <label className="block text-xs font-medium mb-1.5 text-tv-text-secondary">
            {t("mission.config.lhaSelection")}
          </label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {targetAgls.map((agl) => (
              <div key={agl.id}>
                <p className="text-xs font-medium text-tv-text-secondary mb-1">
                  {agl.name}
                </p>
                <div className="space-y-1 pl-2">
                  {agl.lhas.map((lha) => (
                    <label
                      key={lha.id}
                      className="flex items-center gap-2 text-sm text-tv-text-primary cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLhaIds.has(lha.id)}
                        onChange={() => onToggleLha(lha.id)}
                        className="rounded accent-[var(--tv-accent)]"
                        data-testid={`lha-checkbox-${lha.id}`}
                      />
                      <span>
                        {t("mission.config.unitNumber")} {lha.unit_number}
                      </span>
                      <span className="text-tv-text-muted text-xs">
                        {lha.setting_angle}°
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* editable config fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.altitudeOffset")}
          </label>
          <input
            type="number"
            step="0.1"
            value={altitudeOffset}
            onChange={(e) =>
              handleNumberChange("altitude_offset", e.target.value)
            }
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="inspection-altitude-offset"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.speedOverride")}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={speedOverride}
            onChange={(e) =>
              handleNumberChange("speed_override", e.target.value)
            }
            className={`w-full px-3 py-2 rounded-full text-sm border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors ${
              speedWarning ? "border-tv-warning" : "border-tv-border"
            }`}
            data-testid="inspection-speed-override"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.measurementDensity")}
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={measurementDensity}
            onChange={(e) =>
              handleNumberChange("measurement_density", e.target.value)
            }
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="inspection-measurement-density"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.hoverDuration")}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={hoverDuration}
            onChange={(e) =>
              handleNumberChange("hover_duration", e.target.value)
            }
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="inspection-hover-duration"
          />
        </div>
      </div>

      {/* capture mode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.captureMode.title")}
          </label>
          <select
            value={captureMode ?? ""}
            onChange={(e) => {
              const val = e.target.value || null;
              onChange({ ...configOverride, capture_mode: val as CaptureMode | null });
            }}
            className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
            data-testid="inspection-capture-mode"
          >
            <option value="">{t("mission.config.captureMode.useMissionDefault")}</option>
            <option value="VIDEO_CAPTURE">{t("mission.config.captureMode.video")}</option>
            <option value="PHOTO_CAPTURE">{t("mission.config.captureMode.photo")}</option>
          </select>
        </div>
        {effectiveCaptureMode === "VIDEO_CAPTURE" && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.captureMode.recordingSetupDuration")}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={recordingSetupDuration}
              onChange={(e) =>
                handleNumberChange("recording_setup_duration", e.target.value)
              }
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-recording-setup-duration"
            />
          </div>
        )}
      </div>

      {/* speed/framerate warning */}
      {speedWarning && (
        <div
          className="flex items-center gap-2 p-3 rounded-2xl border border-tv-warning bg-tv-warning/10"
          data-testid="speed-framerate-warning"
        >
          <AlertTriangle className="h-4 w-4 text-tv-warning flex-shrink-0" />
          <p className="text-xs text-tv-warning">
            {t("mission.config.speedFramerateWarning")}
          </p>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
