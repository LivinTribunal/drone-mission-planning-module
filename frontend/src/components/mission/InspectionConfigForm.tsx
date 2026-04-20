import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronUp, Crosshair, Info, RotateCcw, Save } from "lucide-react";
import type { InspectionResponse, InspectionConfigOverride, MissionDetailResponse } from "@/types/mission";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { CameraPresetCreate, CameraPresetResponse } from "@/types/cameraPreset";
import type { AGLResponse } from "@/types/airport";
import type { CaptureMode } from "@/types/enums";
import { listCameraPresets, createCameraPreset } from "@/api/cameraPresets";
import { solveTriangle } from "@/utils/angleLock";
import { formatAglDisplayName } from "@/utils/agl";
import {
  WHITE_BALANCE_OPTIONS,
  ISO_OPTIONS,
  SHUTTER_SPEED_OPTIONS,
  OPTICAL_ZOOM_MIN,
} from "@/constants/camera";
import ZoomSlider from "@/components/common/ZoomSlider";
import {
  computeOpticalZoom,
  isZoomOverOptical,
  maxPairwiseDistanceM,
} from "@/utils/cameraAutoCalc";
import { computeMehtHeight } from "@/utils/mehtHeight";

interface InspectionConfigFormProps {
  inspection: InspectionResponse;
  template: InspectionTemplateResponse | null;
  agls: AGLResponse[];
  droneProfile: DroneProfileResponse | null;
  mission: MissionDetailResponse;
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
  mission,
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

  // camera settings - inspection override > saved > template > mission default
  const whiteBalance =
    configOverride.white_balance !== undefined
      ? configOverride.white_balance
      : savedCfg?.white_balance ?? defaultCfg?.white_balance ?? null;
  const isoValue = resolveNumber("iso");
  const shutterSpeed =
    configOverride.shutter_speed !== undefined
      ? configOverride.shutter_speed
      : savedCfg?.shutter_speed ?? defaultCfg?.shutter_speed ?? null;
  const focusMode =
    configOverride.focus_mode !== undefined
      ? configOverride.focus_mode
      : savedCfg?.focus_mode ?? defaultCfg?.focus_mode ?? null;
  const opticalZoom = resolveNumber("optical_zoom");
  // camera_mode override: null = inherit from mission, otherwise AUTO/MANUAL
  const cameraMode: "AUTO" | "MANUAL" | null =
    configOverride.camera_mode !== undefined
      ? configOverride.camera_mode
      : (savedCfg?.camera_mode as "AUTO" | "MANUAL" | null) ?? null;
  const effectiveCameraMode: "AUTO" | "MANUAL" =
    cameraMode ?? (mission.camera_mode ?? "AUTO");

  // horizontal distance from the drone to the lha set - feeds the zoom calc.
  // per method we pull the field that encodes horizontal offset.
  const horizontalDistanceToLha = useMemo(() => {
    const num = (f: keyof InspectionConfigOverride): number | null => {
      const v = resolveNumber(f);
      return typeof v === "number" ? v : null;
    };
    switch (inspection.method) {
      case "HOVER_POINT_LOCK":
        return num("distance_from_lha");
      case "FLY_OVER":
      case "PARALLEL_SIDE_SWEEP":
        return num("lateral_offset") ?? 0;
      case "HORIZONTAL_RANGE":
      case "VERTICAL_PROFILE":
        return num("horizontal_distance");
      default:
        return null;
    }
  }, [configOverride, savedCfg, defaultCfg, inspection.method]);

  // physical span of the selected lha set - zoom must fit this in the frame.
  const lhaSpanM = useMemo(() => {
    const relevantLhas = (
      template?.target_agl_ids?.length
        ? agls.filter((a) => template.target_agl_ids!.includes(a.id))
        : agls
    ).flatMap((a) =>
      a.lhas.filter((l) => selectedLhaIds.size === 0 || selectedLhaIds.has(l.id)),
    );
    const positions = relevantLhas
      .map((l) => {
        const c = l.position?.coordinates;
        if (!c) return null;
        return { lat: c[1], lng: c[0], alt: c[2] ?? 0 };
      })
      .filter((p): p is { lat: number; lng: number; alt: number } => p !== null);
    if (positions.length <= 1) return 0;
    return maxPairwiseDistanceM(positions);
  }, [template, agls, selectedLhaIds]);

  const computedOpticalZoom = useMemo(() => {
    return computeOpticalZoom(
      horizontalDistanceToLha,
      lhaSpanM,
      droneProfile?.sensor_fov ?? null,
      droneProfile?.max_optical_zoom ?? null,
    );
  }, [horizontalDistanceToLha, lhaSpanM, droneProfile?.sensor_fov, droneProfile?.max_optical_zoom]);

  // zoom live-binds to the computed value until the user drags the slider.
  const [zoomTouched, setZoomTouched] = useState<boolean>(() =>
    "optical_zoom" in configOverride
      ? configOverride.optical_zoom != null
      : savedCfg?.optical_zoom != null,
  );

  // reset touched state when switching to a different inspection
  useEffect(() => {
    setZoomTouched(
      "optical_zoom" in configOverride
        ? configOverride.optical_zoom != null
        : savedCfg?.optical_zoom != null,
    );
  }, [inspection.id]);

  // auto-propagate computed zoom while untouched
  useEffect(() => {
    if (zoomTouched || computedOpticalZoom == null) return;
    const current = resolveNumber("optical_zoom");
    if (current === computedOpticalZoom) return;
    onChange({ ...configOverride, optical_zoom: computedOpticalZoom });
  }, [computedOpticalZoom, zoomTouched]);

  const angleOffset = resolveNumber("angle_offset");

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

  // lha setting angle override for horizontal range
  const lhaSettingAngleOverrideId =
    configOverride.lha_setting_angle_override_id !== undefined
      ? configOverride.lha_setting_angle_override_id
      : savedCfg?.lha_setting_angle_override_id ?? defaultCfg?.lha_setting_angle_override_id ?? null;

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

  // meht height computed from first PAPI AGL's distance + glide slope
  const computedMehtHeight = useMemo(() => {
    if (inspection.method !== "MEHT_CHECK") return null;
    const papiAgl = targetAgls.find((a) => a.agl_type === "PAPI");
    if (!papiAgl) return null;
    const dist = papiAgl.distance_from_threshold;
    if (dist == null) return null;
    const gs = papiAgl.glide_slope_angle ?? 3.0;
    return Math.round(computeMehtHeight(dist, gs) * 100) / 100;
  }, [inspection.method, targetAgls]);

  // papi observation angle derived from max setting angle + offset (or override)
  const { computedObservationAngle, missingSettingAngleUnits } = useMemo(() => {
    if (inspection.method !== "HORIZONTAL_RANGE") {
      return { computedObservationAngle: null, missingSettingAngleUnits: [] as string[] };
    }
    const relevantLhas = targetAgls.flatMap((a) =>
      a.lhas.filter((l) => selectedLhaIds.size === 0 || selectedLhaIds.has(l.id)),
    );
    const missing = relevantLhas
      .filter((l) => l.setting_angle == null)
      .map((l) => l.unit_designator);
    const angles = relevantLhas
      .filter((l) => l.setting_angle != null)
      .map((l) => l.setting_angle as number);
    if (angles.length === 0) {
      return { computedObservationAngle: null, missingSettingAngleUnits: missing };
    }
    const effectiveOffset = typeof angleOffset === "number" ? angleOffset : 0.5;

    // when override is set, use that specific lha's angle instead of max.
    // search the full template (not just selectedLhaIds-filtered lhas) so the
    // preview matches the backend, which also ignores the lha_ids filter.
    if (lhaSettingAngleOverrideId) {
      const overrideLha = targetAgls
        .flatMap((a) => a.lhas)
        .find((l) => l.id === lhaSettingAngleOverrideId);
      if (overrideLha?.setting_angle != null) {
        return {
          computedObservationAngle: Math.round((overrideLha.setting_angle + effectiveOffset) * 100) / 100,
          missingSettingAngleUnits: missing,
        };
      }
    }

    const maxAngle = Math.max(...angles);
    return {
      computedObservationAngle: Math.round((maxAngle + effectiveOffset) * 100) / 100,
      missingSettingAngleUnits: missing,
    };
  }, [inspection.method, targetAgls, selectedLhaIds, angleOffset, lhaSettingAngleOverrideId]);

  function handleNumberChange(
    field: keyof InspectionConfigOverride,
    raw: string,
  ) {
    const val = raw === "" ? null : parseFloat(raw);
    onChange({ ...configOverride, [field]: val });
  }

  const [collapsed, setCollapsed] = useState(false);

  // camera preset picker
  const [presets, setPresets] = useState<CameraPresetResponse[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    configOverride.camera_preset_id ?? savedCfg?.camera_preset_id ?? "",
  );
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  const fetchPresets = useCallback(() => {
    const params: { drone_profile_id?: string } = {};
    if (mission.drone_profile_id) {
      params.drone_profile_id = mission.drone_profile_id;
    }
    listCameraPresets(params)
      .then((res) => setPresets(res.data))
      .catch(() => setPresets([]));
  }, [mission.drone_profile_id]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // keep the select bound to whatever preset the override/saved config points at.
  // without this, switching to MANUAL auto-applies the default preset but the
  // dropdown still reads "Apply Preset".
  useEffect(() => {
    const pid = configOverride.camera_preset_id !== undefined
      ? configOverride.camera_preset_id
      : savedCfg?.camera_preset_id ?? null;
    setSelectedPresetId(pid ?? "");
  }, [configOverride.camera_preset_id, savedCfg?.camera_preset_id]);

  function handlePresetSelect(presetId: string) {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      ...configOverride,
      camera_mode: "MANUAL",
      camera_preset_id: preset.id,
      white_balance: preset.white_balance,
      iso: preset.iso,
      shutter_speed: preset.shutter_speed,
      focus_mode: preset.focus_mode,
    });
  }

  function handleCameraModeChange(mode: "INHERIT" | "AUTO" | "MANUAL") {
    if (mode === "INHERIT") {
      onChange({ ...configOverride, camera_mode: null });
      return;
    }
    if (mode === "AUTO") {
      onChange({ ...configOverride, camera_mode: "AUTO" });
      return;
    }
    // MANUAL - fill any empty field with the default preset value. Only
    // values that came from the user or a previous preset count as "set";
    // template defaults and our auto-derived focus/zoom are overwritten.
    const hasExplicit = <K extends keyof InspectionConfigOverride>(
      field: K,
    ): boolean => {
      if (field in configOverride) {
        return (configOverride as Record<string, unknown>)[field] != null;
      }
      return (savedCfg as Record<string, unknown> | null | undefined)?.[field] != null;
    };

    const next: InspectionConfigOverride = { ...configOverride, camera_mode: "MANUAL" };
    const def = presets.find((p) => p.is_default);
    if (def) {
      setSelectedPresetId(def.id);
      next.camera_preset_id = def.id;
      if (!hasExplicit("white_balance")) next.white_balance = def.white_balance;
      if (!hasExplicit("iso")) next.iso = def.iso;
      if (!hasExplicit("shutter_speed")) next.shutter_speed = def.shutter_speed;
      if (!hasExplicit("focus_mode")) next.focus_mode = def.focus_mode;
    }
    // geometry-derived zoom always fills in when user hasn't touched the slider
    if (!zoomTouched && computedOpticalZoom != null) {
      next.optical_zoom = computedOpticalZoom;
    }
    onChange(next);
  }

  function handleSaveAsPreset() {
    if (!presetName.trim()) return;
    setSavingPreset(true);
    createCameraPreset({
      name: presetName.trim(),
      drone_profile_id: mission.drone_profile_id ?? undefined,
      white_balance: whiteBalance as CameraPresetCreate["white_balance"],
      iso: (typeof isoValue === "number" ? isoValue : undefined) as CameraPresetCreate["iso"],
      shutter_speed: shutterSpeed as CameraPresetCreate["shutter_speed"],
      focus_mode: focusMode as CameraPresetCreate["focus_mode"],
    })
      .then(() => {
        setShowSavePreset(false);
        setPresetName("");
        fetchPresets();
      })
      .catch((err) => {
        console.error("save preset failed", err);
      })
      .finally(() => setSavingPreset(false));
  }

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
        {inspection.method !== "HOVER_POINT_LOCK" && inspection.method !== "MEHT_CHECK" && (
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
      {inspection.method !== "HOVER_POINT_LOCK" && inspection.method !== "MEHT_CHECK" && targetAgls.length > 0 && (
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
        {inspection.method !== "HOVER_POINT_LOCK" && inspection.method !== "MEHT_CHECK" && (
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
        {inspection.method !== "HOVER_POINT_LOCK" && inspection.method !== "MEHT_CHECK" && (
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

      {/* missing setting angle warning */}
      {inspection.method === "HORIZONTAL_RANGE" &&
        missingSettingAngleUnits.length > 0 && (
        <div
          className="flex items-center gap-2 p-3 rounded-2xl border border-tv-warning bg-tv-warning/10"
          data-testid="missing-setting-angle-warning"
        >
          <AlertTriangle className="h-4 w-4 text-tv-warning flex-shrink-0" />
          <p className="text-xs text-tv-warning">
            {t("mission.config.missingSettingAngleWarning", {
              units: missingSettingAngleUnits.join(", "),
            })}
          </p>
        </div>
      )}

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
          {inspection.method === "HORIZONTAL_RANGE" && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.angleOffset")}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={angleOffset}
                onChange={(e) =>
                  handleNumberChange("angle_offset", e.target.value)
                }
                placeholder={t("mission.config.angleOffsetHint")}
                className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="inspection-angle-offset"
              />
            </div>
          )}
          {inspection.method === "HORIZONTAL_RANGE" && (
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
          {inspection.method === "HORIZONTAL_RANGE" && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.lhaSettingAngleOverride")}
              </label>
              <select
                value={lhaSettingAngleOverrideId ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  onChange({ ...configOverride, lha_setting_angle_override_id: v });
                }}
                className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
                data-testid="inspection-lha-setting-angle-override"
              >
                <option value="">{t("mission.config.lhaSettingAngleOverrideAuto")}</option>
                {targetAgls.flatMap((agl) =>
                  agl.lhas.map((lha) => (
                    <option key={lha.id} value={lha.id}>
                      {t("mission.config.unitDesignator")} {lha.unit_designator}
                      {lha.setting_angle != null ? ` (${lha.setting_angle}°)` : ""}
                    </option>
                  )),
                )}
              </select>
              <p className="text-[11px] text-tv-text-muted mt-1">
                {t("mission.config.lhaSettingAngleOverrideHint")}
              </p>
            </div>
          )}
          {inspection.method === "HORIZONTAL_RANGE" &&
            computedObservationAngle != null && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.computedObservationAngle")}
              </label>
              <p
                className="px-3 py-2 text-sm text-tv-text-primary"
                data-testid="computed-observation-angle"
              >
                {computedObservationAngle}°
              </p>
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

      {/* buffer distance override - inlined into the top grid for hover point lock,
          and into the geometry grid for horizontal range */}
      {inspection.method !== "HOVER_POINT_LOCK" &&
        inspection.method !== "HORIZONTAL_RANGE" && (
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

      {/* direction heading - fly-over and parallel side sweep only */}
      {(inspection.method === "FLY_OVER" || inspection.method === "PARALLEL_SIDE_SWEEP") && (
        <div className="rounded-2xl border border-tv-border bg-tv-bg/50 p-3 space-y-2" data-testid="direction-heading-section">
          <label className="block text-xs font-medium text-tv-text-primary">
            {t("mission.config.directionHeading")}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="1"
              min="0"
              max="359"
              value={resolveNumber("direction_heading")}
              onChange={(e) =>
                handleNumberChange("direction_heading", e.target.value)
              }
              placeholder={t("mission.config.directionHeadingHint")}
              className="w-32 px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="inspection-direction-heading"
            />
            <svg className="h-6 w-6 flex-shrink-0" viewBox="0 0 24 24">
              <line
                x1="12" y1="20" x2="12" y2="4"
                stroke="var(--tv-accent)" strokeWidth="2" strokeLinecap="round"
                transform={`rotate(${typeof resolveNumber("direction_heading") === "number" ? resolveNumber("direction_heading") : 0}, 12, 12)`}
              />
              <polygon
                points="12,2 9,8 15,8"
                fill="var(--tv-accent)"
                transform={`rotate(${typeof resolveNumber("direction_heading") === "number" ? resolveNumber("direction_heading") : 0}, 12, 12)`}
              />
            </svg>
            <button
              type="button"
              onClick={() => {
                const current = resolveNumber("direction_heading");
                if (typeof current === "number") {
                  onChange({ ...configOverride, direction_heading: (current + 180) % 360 });
                }
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors flex-shrink-0"
              title={t("mission.config.oppositeDirection")}
              data-testid="inspection-direction-heading-opposite"
            >
              <RotateCcw className="h-3 w-3" />
              {t("mission.config.oppositeDirection")}
            </button>
          </div>
          <p className="text-[11px] text-tv-text-muted leading-snug">
            {t("mission.config.directionHeadingHint")}
          </p>
        </div>
      )}

      {/* camera settings - falls back to mission defaults */}
      <div data-testid="camera-settings-section">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs font-semibold text-tv-text-secondary">
            {t("mission.config.cameraSettings.title")}
          </label>
          <div className="inline-flex rounded-full border border-tv-border bg-tv-bg p-0.5 text-xs" data-testid="inspection-camera-mode">
            {([
              { key: "INHERIT", active: cameraMode === null },
              { key: "AUTO", active: cameraMode === "AUTO" },
              { key: "MANUAL", active: cameraMode === "MANUAL" },
            ] as const).map(({ key, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleCameraModeChange(key)}
                className={`px-3 py-1 rounded-full transition-colors ${active ? "bg-tv-accent text-white font-medium" : "text-tv-text-secondary hover:text-tv-text-primary"}`}
                data-testid={`inspection-camera-mode-${key.toLowerCase()}`}
              >
                {t(
                  key === "INHERIT"
                    ? "mission.config.cameraSettings.modeInherit"
                    : key === "AUTO"
                      ? "mission.config.cameraSettings.modeAuto"
                      : "mission.config.cameraSettings.modeManual",
                )}
              </button>
            ))}
          </div>
        </div>
        {effectiveCameraMode === "AUTO" && (
          <p className="text-[11px] text-tv-text-muted leading-tight mb-2">
            {t("mission.config.cameraSettings.modeAutoHint")}
          </p>
        )}

        {effectiveCameraMode === "MANUAL" && (<>
        {/* preset picker */}
        <div className="mb-3" data-testid="camera-preset-picker">
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.cameraSettings.presetLabel")}
          </label>
          <select
            value={selectedPresetId}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
            data-testid="camera-preset-select"
          >
            <option value="">{t("mission.config.cameraSettings.presetNone")}</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? ` (${t("mission.config.cameraSettings.presetDefault")})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.whiteBalance")}
            </label>
            <select
              value={whiteBalance ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                onChange({ ...configOverride, white_balance: val });
              }}
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="inspection-white-balance"
            >
              <option value="">
                {mission.default_white_balance
                  ? `${t("mission.config.cameraSettings.missionDefault")}: ${WHITE_BALANCE_OPTIONS.find((o) => o.value === mission.default_white_balance)?.label ?? mission.default_white_balance}`
                  : t("mission.config.cameraSettings.notSet")}
              </option>
              {WHITE_BALANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.iso")}
            </label>
            <select
              value={isoValue}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                onChange({ ...configOverride, iso: val });
              }}
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="inspection-iso"
            >
              <option value="">
                {mission.default_iso != null
                  ? `${t("mission.config.cameraSettings.missionDefault")}: ${mission.default_iso}`
                  : t("mission.config.cameraSettings.notSet")}
              </option>
              {ISO_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.shutterSpeed")}
            </label>
            <select
              value={shutterSpeed ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                onChange({ ...configOverride, shutter_speed: val });
              }}
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="inspection-shutter-speed"
            >
              <option value="">
                {mission.default_shutter_speed
                  ? `${t("mission.config.cameraSettings.missionDefault")}: ${mission.default_shutter_speed}`
                  : t("mission.config.cameraSettings.notSet")}
              </option>
              {SHUTTER_SPEED_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.focusMode")}
            </label>
            <select
              value={focusMode ?? ""}
              onChange={(e) => {
                const val = (e.target.value || null) as "AUTO" | "INFINITY" | null;
                onChange({ ...configOverride, focus_mode: val });
              }}
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="inspection-focus-mode"
            >
              <option value="">
                {mission.default_focus_mode
                  ? `${t("mission.config.cameraSettings.missionDefault")}: ${t(`mission.config.cameraSettings.fm.${{ AUTO: "auto", INFINITY: "infinity" }[mission.default_focus_mode] ?? mission.default_focus_mode}`, mission.default_focus_mode)}`
                  : t("mission.config.cameraSettings.notSet")}
              </option>
              <option value="AUTO">{t("mission.config.cameraSettings.fm.auto")}</option>
              <option value="INFINITY">{t("mission.config.cameraSettings.fm.infinity")}</option>
            </select>
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-tv-text-secondary">
                {t("mission.config.cameraSettings.opticalZoom")}
              </label>
              <div className="flex items-center gap-1.5">
                {!zoomTouched && computedOpticalZoom != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-tv-accent/10 text-tv-accent font-medium">
                    {t("mission.config.cameraSettings.auto")}
                  </span>
                )}
                {zoomTouched && computedOpticalZoom != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoomTouched(false);
                      onChange({ ...configOverride, optical_zoom: computedOpticalZoom });
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-tv-text-secondary hover:text-tv-accent transition-colors"
                    data-testid="optical-zoom-reset"
                    title={t("mission.config.cameraSettings.resetToAuto")}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("mission.config.cameraSettings.resetToAuto")}
                  </button>
                )}
                <span className="text-xs text-tv-text-secondary">{typeof opticalZoom === "number" ? `${opticalZoom}x` : ""}</span>
              </div>
            </div>
            <ZoomSlider
              value={typeof opticalZoom === "number" ? opticalZoom : OPTICAL_ZOOM_MIN}
              onChange={(v) => {
                setZoomTouched(true);
                handleNumberChange("optical_zoom", String(v));
              }}
              maxOpticalZoom={droneProfile?.max_optical_zoom}
              testId="inspection-optical-zoom"
            />
            {isZoomOverOptical(
              typeof opticalZoom === "number" ? opticalZoom : null,
              droneProfile?.max_optical_zoom ?? null,
            ) && (
              <div
                className="mt-1 flex items-start gap-1 text-xs text-tv-warning"
                data-testid="zoom-over-optical-warning"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {t("mission.config.cameraSettings.zoomOverOpticalWarning", {
                    max: droneProfile?.max_optical_zoom,
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* save as preset */}
        {!showSavePreset ? (
          <button
            type="button"
            onClick={() => setShowSavePreset(true)}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
            data-testid="save-as-preset-btn"
          >
            <Save className="h-3 w-3" />
            {t("mission.config.cameraSettings.saveAsPreset")}
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2" data-testid="save-preset-form">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t("mission.config.cameraSettings.presetNamePlaceholder")}
              className="flex-1 px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="preset-name-input"
            />
            <button
              type="button"
              onClick={handleSaveAsPreset}
              disabled={savingPreset || !presetName.trim()}
              className="px-3 py-1.5 rounded-full text-xs bg-tv-accent text-tv-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="preset-save-confirm"
            >
              {t("mission.config.cameraSettings.presetSave")}
            </button>
            <button
              type="button"
              onClick={() => { setShowSavePreset(false); setPresetName(""); }}
              className="px-3 py-1.5 rounded-full text-xs border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
            >
              {t("mission.config.cameraSettings.presetCancel")}
            </button>
          </div>
        )}
        </>)}
      </div>

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

      {/* meht-check specific */}
      {inspection.method === "MEHT_CHECK" && (
        <div className="space-y-3" data-testid="meht-check-fields">
          {computedMehtHeight != null && (
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("mission.config.mehtHeight")}
              </label>
              <p
                className="px-3 py-2 text-sm text-tv-text-primary"
                data-testid="computed-meht-height"
              >
                {computedMehtHeight} {t("mission.config.mehtHeightUnit")}
              </p>
              <p className="text-[11px] text-tv-text-muted mt-0.5">
                {t("mission.config.mehtHeightHint")}
              </p>
            </div>
          )}
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

      {/* zoom-over-optical validation warning */}
      {isZoomOverOptical(
        typeof opticalZoom === "number" ? opticalZoom : null,
        droneProfile?.max_optical_zoom ?? null,
      ) && (
        <div
          className="flex items-center gap-2 p-3 rounded-2xl border border-tv-warning bg-tv-warning/10"
          data-testid="zoom-over-optical-validation"
        >
          <AlertTriangle className="h-4 w-4 text-tv-warning flex-shrink-0" />
          <p className="text-xs text-tv-warning">
            {t("mission.config.cameraSettings.zoomOverOpticalWarning", {
              max: droneProfile?.max_optical_zoom,
            })}
          </p>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
