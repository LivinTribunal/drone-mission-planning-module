import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronUp, Crosshair, Info, RotateCcw } from "lucide-react";
import type { InspectionResponse, InspectionConfigOverride } from "@/types/mission";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { AGLResponse } from "@/types/airport";
import type { CaptureMode } from "@/types/enums";
import { solveTriangle } from "@/utils/angleLock";
import { formatAglDisplayName } from "@/utils/agl";

interface InspectionConfigFormProps {
  inspection: InspectionResponse;
  template: InspectionTemplateResponse | null;
  agls: AGLResponse[];
  droneProfile: DroneProfileResponse | null;
  configOverride: InspectionConfigOverride;
  onChange: (override: InspectionConfigOverride) => void;
  selectedLhaIds: Set<string>;
  onToggleLha: (lhaId: string) => void;
  disabled?: boolean;
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
  disabled = false,
}: InspectionConfigFormProps) {
  const { t } = useTranslation();

  // resolve values: dirty override > saved config > template defaults
  // explicit null in override means "cleared by user" - don't fall through to saved/default.
  const savedCfg = inspection.config;
  const defaultCfg = template?.default_config;

  function resolveNumber(field: keyof InspectionConfigOverride): number | "" {
    if (field in configOverride) {
      const v = configOverride[field];
      return typeof v === "number" ? v : "";
    }
    const saved = savedCfg?.[field as keyof typeof savedCfg];
    if (typeof saved === "number") return saved;
    const def = defaultCfg?.[field as keyof typeof defaultCfg];
    return typeof def === "number" ? def : "";
  }

  const altitudeOffset = resolveNumber("altitude_offset");
  const measurementSpeedOverride = resolveNumber("measurement_speed_override");
  const measurementDensity = resolveNumber("measurement_density");
  const hoverDuration = resolveNumber("hover_duration");
  const bufferDistance = resolveNumber("buffer_distance");
  const horizontalDistance = resolveNumber("horizontal_distance");
  const sweepAngle = resolveNumber("sweep_angle");
  const verticalProfileHeight = resolveNumber("vertical_profile_height");
  const captureMode =
    configOverride.capture_mode !== undefined
      ? configOverride.capture_mode
      : savedCfg?.capture_mode ?? defaultCfg?.capture_mode ?? null;
  const recordingSetupDuration = resolveNumber("recording_setup_duration");

  // method-specific fields
  const heightAboveLights = resolveNumber("height_above_lights");
  const lateralOffset = resolveNumber("lateral_offset");
  const distanceFromLha = resolveNumber("distance_from_lha");
  const heightAboveLha = resolveNumber("height_above_lha");
  const cameraGimbalAngle = resolveNumber("camera_gimbal_angle");
  const hoverBearing = resolveNumber("hover_bearing");
  const hoverBearingReference: "RUNWAY" | "COMPASS" =
    ("hover_bearing_reference" in configOverride
      ? configOverride.hover_bearing_reference
      : savedCfg?.hover_bearing_reference ?? defaultCfg?.hover_bearing_reference) ?? "RUNWAY";
  const selectedLhaId =
    configOverride.selected_lha_id !== undefined
      ? configOverride.selected_lha_id
      : savedCfg?.selected_lha_id ?? defaultCfg?.selected_lha_id ?? null;

  // angle-lock toggle: when on, editing one of {height, distance, angle}
  // recomputes the third so the triangle stays consistent.
  const [angleLocked, setAngleLocked] = useState(false);

  // hover-point-lock AGL picker - seeded from the currently selected LHA's parent
  const aglOfSelectedLha = useMemo(() => {
    if (!selectedLhaId) return null;
    return agls.find((a) => a.lhas.some((l) => l.id === selectedLhaId)) ?? null;
  }, [agls, selectedLhaId]);
  const [hoverAglId, setHoverAglId] = useState<string>(aglOfSelectedLha?.id ?? "");
  // keep hoverAglId in sync if the parent changes selected_lha_id externally
  useEffect(() => {
    if (aglOfSelectedLha && aglOfSelectedLha.id !== hoverAglId) {
      setHoverAglId(aglOfSelectedLha.id);
    }
  }, [aglOfSelectedLha, hoverAglId]);
  const hoverAgl = agls.find((a) => a.id === hoverAglId) ?? null;

  // effective capture mode for conditional display
  const effectiveCaptureMode = captureMode ?? "VIDEO_CAPTURE";

  // measurement speed warning - checks max_speed since path_distance is not available here
  const speedWarning = useMemo(() => {
    const speed =
      configOverride.measurement_speed_override ??
      savedCfg?.measurement_speed_override ??
      defaultCfg?.measurement_speed_override;
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
      <div className={`space-y-4 mt-3${disabled ? " pointer-events-none opacity-60" : ""}`}>

      {/* read-only fields - method is implicit for hover point lock */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.templateName")}
          </label>
          <p className="text-sm text-tv-text-primary">
            {template?.name ?? "-"}
          </p>
        </div>
        {inspection.method !== "HOVER_POINT_LOCK" && (
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.method")}
          </label>
          <p className="text-sm text-tv-text-primary">
            {t(`map.inspectionMethod.${inspection.method}`, inspection.method)}
          </p>
        </div>
        )}
      </div>

      {/* hover-point-lock AGL/LHA picker - rendered at the top of the config */}
      {inspection.method === "HOVER_POINT_LOCK" && (
        <div className="grid grid-cols-2 gap-2" data-testid="hover-point-lock-target">
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.targetAgl")}
            </label>
            <select
              value={hoverAglId}
              onChange={(e) => {
                setHoverAglId(e.target.value);
                onChange({ ...configOverride, selected_lha_id: null });
              }}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-hover-agl"
            >
              <option value="">{t("mission.config.targetAglSelect")}</option>
              {agls.map((agl) => (
                <option key={agl.id} value={agl.id}>
                  {formatAglDisplayName(agl)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.targetLha")}
            </label>
            <select
              value={selectedLhaId ?? ""}
              disabled={!hoverAgl}
              onChange={(e) => {
                const v = e.target.value || null;
                onChange({ ...configOverride, selected_lha_id: v });
              }}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors disabled:opacity-50"
              data-testid="inspection-selected-lha"
            >
              <option value="">{t("mission.config.targetLhaSelect")}</option>
              {hoverAgl?.lhas.map((lha) => (
                <option key={lha.id} value={lha.id}>
                  {t("mission.config.unitDesignator")} {lha.unit_designator}
                  {lha.setting_angle != null ? ` (${lha.setting_angle}°)` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* agl / lha selection - hover point lock picks a single LHA above instead */}
      {inspection.method !== "HOVER_POINT_LOCK" && targetAgls.length > 0 && (
        <div>
          <label className="block text-xs font-medium mb-1.5 text-tv-text-secondary">
            {t("mission.config.lhaSelection")}
          </label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {targetAgls.map((agl) => (
              <div key={agl.id}>
                <p className="text-xs font-medium text-tv-text-secondary mb-1">
                  {formatAglDisplayName(agl)}
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
                        {t("mission.config.unitDesignator")} {lha.unit_designator}
                      </span>
                      <span className="text-tv-text-muted text-xs">
                        {lha.setting_angle != null ? `${lha.setting_angle}°` : "—"}
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
        {inspection.method !== "HOVER_POINT_LOCK" && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.measurementSpeedOverride")}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={measurementSpeedOverride}
              onChange={(e) =>
                handleNumberChange("measurement_speed_override", e.target.value)
              }
              placeholder={t("mission.config.measurementSpeedOverrideHint")}
              className={`w-full px-3 py-2 rounded-full text-sm border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors ${
                speedWarning ? "border-tv-warning" : "border-tv-border"
              }`}
              data-testid="inspection-measurement-speed-override"
            />
          </div>
        )}
        {inspection.method !== "HOVER_POINT_LOCK" && (
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
        )}
        {inspection.method === "HOVER_POINT_LOCK" && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.bufferDistanceOverride")}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={bufferDistance}
              onChange={(e) =>
                handleNumberChange("buffer_distance", e.target.value)
              }
              placeholder={t("mission.config.bufferDistanceOverrideHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-buffer-distance"
            />
          </div>
        )}
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
              placeholder={t("mission.config.captureMode.recordingSetupDurationHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-recording-setup-duration"
            />
          </div>
        )}
      </div>

      {/* geometry overrides - only methods that consume them */}
      {(inspection.method === "VERTICAL_PROFILE" ||
        inspection.method === "HORIZONTAL_RANGE") && (
        <div
          className="grid grid-cols-2 gap-3"
          data-testid="geometry-override-fields"
        >
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.horizontalDistance")}
            </label>
            <input
              type="number"
              step="1"
              min="50"
              value={horizontalDistance}
              onChange={(e) =>
                handleNumberChange("horizontal_distance", e.target.value)
              }
              placeholder={t("mission.config.horizontalDistanceHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-horizontal-distance"
            />
          </div>
          {inspection.method === "HORIZONTAL_RANGE" && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.sweepAngle")}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="180"
                value={sweepAngle}
                onChange={(e) =>
                  handleNumberChange("sweep_angle", e.target.value)
                }
                placeholder={t("mission.config.sweepAngleHint")}
                className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-sweep-angle"
              />
            </div>
          )}
          {inspection.method === "VERTICAL_PROFILE" && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.verticalProfileHeight")}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                value={verticalProfileHeight}
                onChange={(e) =>
                  handleNumberChange("vertical_profile_height", e.target.value)
                }
                placeholder={t("mission.config.verticalProfileHeightHint")}
                className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-vertical-profile-height"
              />
            </div>
          )}
        </div>
      )}

      {/* buffer distance override - inlined into the top grid for hover point lock */}
      {inspection.method !== "HOVER_POINT_LOCK" && (
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.bufferDistanceOverride")}
        </label>
        <input
          type="number"
          step="0.5"
          min="0"
          value={bufferDistance}
          onChange={(e) =>
            handleNumberChange("buffer_distance", e.target.value)
          }
          placeholder={t("mission.config.bufferDistanceOverrideHint")}
          className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
          data-testid="inspection-buffer-distance"
        />
      </div>
      )}

      {/* fly-over specific */}
      {inspection.method === "FLY_OVER" && (
        <div className="grid grid-cols-2 gap-3" data-testid="fly-over-fields">
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.heightAboveLights")}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={heightAboveLights}
              onChange={(e) =>
                handleNumberChange("height_above_lights", e.target.value)
              }
              placeholder={t("mission.config.heightAboveLightsHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-height-above-lights"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraGimbalAngle")}
            </label>
            <input
              type="number"
              step="1"
              min="-90"
              max="0"
              value={cameraGimbalAngle}
              onChange={(e) =>
                handleNumberChange("camera_gimbal_angle", e.target.value)
              }
              placeholder={t("mission.config.cameraGimbalAngleHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-camera-gimbal-angle"
            />
          </div>
        </div>
      )}

      {/* parallel side sweep specific */}
      {inspection.method === "PARALLEL_SIDE_SWEEP" && (
        <div
          className="grid grid-cols-2 gap-3"
          data-testid="parallel-side-sweep-fields"
        >
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.lateralOffset")}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={lateralOffset}
              onChange={(e) =>
                handleNumberChange("lateral_offset", e.target.value)
              }
              placeholder={t("mission.config.lateralOffsetHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-lateral-offset"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.heightAboveLights")}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={heightAboveLights}
              onChange={(e) =>
                handleNumberChange("height_above_lights", e.target.value)
              }
              placeholder={t("mission.config.heightAboveLightsHint")}
              className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-height-above-lights"
            />
          </div>
        </div>
      )}

      {/* hover-point-lock specific */}
      {inspection.method === "HOVER_POINT_LOCK" && (
        <div className="space-y-3" data-testid="hover-point-lock-fields">
          {/* auto-aim toggle: trig-locks the distance/height/angle triangle */}
          <div className="rounded-2xl border border-tv-border bg-tv-bg/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <Crosshair className="h-3.5 w-3.5 text-tv-text-secondary flex-shrink-0" />
                <label className="text-xs font-medium text-tv-text-primary truncate">
                  {t("mission.config.angleLock")}
                </label>
              </div>
              <button
                type="button"
                onClick={() => setAngleLocked((v) => !v)}
                role="switch"
                aria-checked={angleLocked}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  angleLocked ? "bg-tv-accent" : "bg-tv-border"
                }`}
                data-testid="angle-lock-toggle"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    angleLocked ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-tv-text-muted leading-snug">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{t("mission.config.angleLockHint")}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.distanceFromLha")}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={distanceFromLha}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === "" ? null : parseFloat(raw);
                  const next: InspectionConfigOverride = {
                    ...configOverride,
                    distance_from_lha: val,
                  };
                  if (
                    angleLocked &&
                    val != null &&
                    typeof cameraGimbalAngle === "number"
                  ) {
                    const { height } = solveTriangle({
                      distance: val,
                      angle: cameraGimbalAngle,
                    });
                    if (height != null) next.height_above_lha = height;
                  }
                  onChange(next);
                }}
                placeholder={t("mission.config.distanceFromLhaHint")}
                className="w-full px-2 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-distance-from-lha"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.heightAboveLha")}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={heightAboveLha}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === "" ? null : parseFloat(raw);
                  const next: InspectionConfigOverride = {
                    ...configOverride,
                    height_above_lha: val,
                  };
                  if (
                    angleLocked &&
                    val != null &&
                    typeof distanceFromLha === "number"
                  ) {
                    const { angle } = solveTriangle({
                      height: val,
                      distance: distanceFromLha,
                    });
                    if (angle != null) next.camera_gimbal_angle = angle;
                  }
                  onChange(next);
                }}
                placeholder={t("mission.config.heightAboveLhaHint")}
                className="w-full px-2 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-height-above-lha"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.cameraGimbalAngle")}
              </label>
              <input
                type="number"
                step="1"
                min="-90"
                max="0"
                value={cameraGimbalAngle}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === "" ? null : parseFloat(raw);
                  const next: InspectionConfigOverride = {
                    ...configOverride,
                    camera_gimbal_angle: val,
                  };
                  if (
                    angleLocked &&
                    val != null &&
                    typeof distanceFromLha === "number"
                  ) {
                    const { height } = solveTriangle({
                      distance: distanceFromLha,
                      angle: val,
                    });
                    if (height != null) next.height_above_lha = height;
                  }
                  onChange(next);
                }}
                placeholder={t("mission.config.cameraGimbalAngleHint")}
                className="w-full px-2 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-camera-gimbal-angle"
              />
            </div>
          </div>

          {/* approach bearing: where the drone sits relative to the LHA */}
          <div className="rounded-2xl border border-tv-border bg-tv-bg/50 p-3 space-y-2">
            <label className="block text-xs font-medium text-tv-text-primary">
              {t("mission.config.hoverBearing")}
            </label>
            <div className="flex gap-1 rounded-full bg-tv-bg border border-tv-border p-0.5">
              {(["RUNWAY", "COMPASS"] as const).map((ref) => (
                <button
                  key={ref}
                  type="button"
                  onClick={() =>
                    onChange({ ...configOverride, hover_bearing_reference: ref })
                  }
                  className={`flex-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    hoverBearingReference === ref
                      ? "bg-tv-accent text-tv-accent-text"
                      : "text-tv-text-secondary hover:text-tv-text-primary"
                  }`}
                  data-testid={`hover-bearing-ref-${ref.toLowerCase()}`}
                >
                  {t(`mission.config.hoverBearingRef.${ref}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 items-center justify-end">
              <input
                type="number"
                step="1"
                min="-360"
                max="360"
                value={hoverBearing}
                onChange={(e) =>
                  handleNumberChange("hover_bearing", e.target.value)
                }
                placeholder={t(
                  hoverBearingReference === "COMPASS"
                    ? "mission.config.hoverBearingCompassHint"
                    : "mission.config.hoverBearingRunwayHint",
                )}
                className="w-48 px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary text-right placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-hover-bearing"
              />
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(String(hoverBearing));
                  if (!isNaN(current)) {
                    onChange({ ...configOverride, hover_bearing: (current + 180) % 360 });
                  }
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors flex-shrink-0"
                title={t("coordinator.detail.oppositeHeading")}
                data-testid="inspection-hover-bearing-opposite"
              >
                <RotateCcw className="h-3 w-3" />
                {t("coordinator.detail.opposite")}
              </button>
            </div>
            <p className="text-[11px] text-tv-text-muted leading-snug">
              {t(
                hoverBearingReference === "COMPASS"
                  ? "mission.config.hoverBearingCompassHelp"
                  : "mission.config.hoverBearingRunwayHelp",
              )}
            </p>
          </div>
        </div>
      )}

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
