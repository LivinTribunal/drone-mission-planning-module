import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type {
  BoundaryConstraintMode,
  BoundaryPreference,
  MissionDetailResponse,
  MissionUpdate,
} from "@/types/mission";
import type { CaptureMode, FlightPlanScope } from "@/types/enums";
import FlightPlanScopeSelector from "./FlightPlanScopeSelector";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { CameraPresetResponse } from "@/types/cameraPreset";
import type { PointZ } from "@/types/common";
import { listCameraPresets } from "@/api/cameraPresets";
import {
  WHITE_BALANCE_OPTIONS,
  ISO_OPTIONS,
  SHUTTER_SPEED_OPTIONS,
} from "@/constants/camera";
import Toggle from "@/components/common/Toggle";
import CoordinateInput from "./CoordinateInput";

type PickTarget = "takeoff" | "landing" | null;

interface MissionConfigFormProps {
  mission: MissionDetailResponse;
  droneProfiles: DroneProfileResponse[];
  values: Partial<MissionUpdate>;
  onChange: (update: Partial<MissionUpdate>) => void;
  pickingCoord?: PickTarget;
  onPickCoord?: (target: PickTarget) => void;
  defaultAltitude?: number;
  disabled?: boolean;
  // optional controlled mirror-mode state - when omitted the checkbox is
  // self-contained; the parent lifts this when pick-on-map also needs to mirror
  useTakeoffAsLanding?: boolean;
  onUseTakeoffAsLandingChange?: (value: boolean) => void;
  // whether the airport has an AIRPORT_BOUNDARY safety zone - boundary
  // behavior selectors are disabled when this is false.
  hasAirportBoundary?: boolean;
}

function DroneProfileDropdown({
  droneProfiles,
  selectedId,
  onSelect,
}: {
  droneProfiles: DroneProfileResponse[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  /** compact drone profile selector with search. */
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 0);
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = droneProfiles.find((dp) => dp.id === selectedId);
  const filtered = search
    ? droneProfiles.filter((dp) =>
        dp.name.toLowerCase().includes(search.toLowerCase())
        || (dp.manufacturer ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : droneProfiles;

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
        {t("mission.config.droneProfile")}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm border bg-tv-bg text-tv-text-primary transition-colors ${
          open ? "border-tv-accent" : "border-tv-border hover:bg-tv-surface-hover"
        }`}
        data-testid="drone-profile-select"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate">
            {selected ? selected.name : t("mission.config.selectDrone")}
          </span>
          {selected?.manufacturer && (
            <span className="text-[10px] text-tv-text-muted flex-shrink-0">{selected.manufacturer}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-tv-text-secondary flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl border border-tv-border bg-tv-surface z-50">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tv-text-muted" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("mission.config.searchDrone")}
                className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
              />
            </div>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {selectedId && (
              <button
                type="button"
                onClick={() => { onSelect(""); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-tv-text-muted hover:bg-tv-surface-hover transition-colors"
              >
                {t("mission.config.selectDrone")}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-tv-text-muted text-center italic">
                {t("common.noResults")}
              </p>
            ) : (
              filtered.map((dp) => {
                const isSelected = dp.id === selectedId;
                return (
                  <button
                    key={dp.id}
                    type="button"
                    onClick={() => { onSelect(dp.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      isSelected ? "bg-tv-accent text-tv-accent-text" : "hover:bg-tv-surface-hover"
                    }`}
                  >
                    <span className={`text-sm truncate block ${isSelected ? "font-medium" : "text-tv-text-primary"}`}>
                      {dp.name}
                    </span>
                    <div className={`flex items-center gap-3 text-[10px] mt-0.5 ${isSelected ? "text-tv-accent-text/70" : "text-tv-text-muted"}`}>
                      {dp.manufacturer && <span>{dp.manufacturer}</span>}
                      {dp.endurance_minutes != null && <span>{dp.endurance_minutes} min</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissionConfigForm({
  mission,
  droneProfiles,
  values,
  onChange,
  pickingCoord,
  onPickCoord,
  defaultAltitude,
  disabled = false,
  useTakeoffAsLanding: useTakeoffAsLandingProp,
  onUseTakeoffAsLandingChange,
  hasAirportBoundary = true,
}: MissionConfigFormProps) {
  /** mission-level configuration form with coordinate pick-on-map support. */
  const { t } = useTranslation();
  const [localUseTakeoffAsLanding, setLocalUseTakeoffAsLanding] = useState(false);
  const useTakeoffAsLanding = useTakeoffAsLandingProp ?? localUseTakeoffAsLanding;
  const setUseTakeoffAsLanding = (value: boolean) => {
    if (onUseTakeoffAsLandingChange) onUseTakeoffAsLandingChange(value);
    else setLocalUseTakeoffAsLanding(value);
  };

  const droneProfileId =
    values.drone_profile_id !== undefined
      ? values.drone_profile_id
      : mission.drone_profile_id;
  const defaultSpeed =
    values.default_speed !== undefined
      ? values.default_speed
      : mission.default_speed;
  const measurementSpeedOverride =
    values.measurement_speed_override !== undefined
      ? values.measurement_speed_override
      : mission.measurement_speed_override;
  const defaultAltitudeOffset =
    values.default_altitude_offset !== undefined
      ? values.default_altitude_offset
      : mission.default_altitude_offset;
  const takeoff =
    values.takeoff_coordinate !== undefined
      ? values.takeoff_coordinate
      : mission.takeoff_coordinate;
  const landing =
    values.landing_coordinate !== undefined
      ? values.landing_coordinate
      : mission.landing_coordinate;
  const notes =
    values.operator_notes !== undefined
      ? values.operator_notes
      : mission.operator_notes;
  const defaultCaptureMode =
    values.default_capture_mode !== undefined
      ? values.default_capture_mode
      : mission.default_capture_mode;
  const defaultBufferDistance =
    values.default_buffer_distance !== undefined
      ? values.default_buffer_distance
      : mission.default_buffer_distance;
  const defaultWhiteBalance =
    values.default_white_balance !== undefined
      ? values.default_white_balance
      : mission.default_white_balance;
  const defaultIso =
    values.default_iso !== undefined
      ? values.default_iso
      : mission.default_iso;
  const defaultShutterSpeed =
    values.default_shutter_speed !== undefined
      ? values.default_shutter_speed
      : mission.default_shutter_speed;
  const defaultFocusMode =
    values.default_focus_mode !== undefined
      ? values.default_focus_mode
      : mission.default_focus_mode;
  const cameraMode =
    values.camera_mode !== undefined
      ? values.camera_mode
      : (mission.camera_mode ?? "AUTO");
  const transitAgl =
    values.transit_agl !== undefined
      ? values.transit_agl
      : mission.transit_agl;
  const requirePerpendicularCrossing =
    values.require_perpendicular_runway_crossing !== undefined
      ? values.require_perpendicular_runway_crossing
      : mission.require_perpendicular_runway_crossing ?? true;
  const flightPlanScope: FlightPlanScope =
    values.flight_plan_scope !== undefined
      ? values.flight_plan_scope
      : mission.flight_plan_scope ?? "FULL";
  const boundaryConstraintMode: BoundaryConstraintMode =
    values.boundary_constraint_mode !== undefined
      ? values.boundary_constraint_mode
      : mission.boundary_constraint_mode ?? "NONE";
  const boundaryPreference: BoundaryPreference =
    values.boundary_preference !== undefined
      ? values.boundary_preference
      : mission.boundary_preference ?? "DONT_CARE";

  const [presets, setPresets] = useState<CameraPresetResponse[]>([]);
  const [appliedPresetId, setAppliedPresetId] = useState<string>("");

  const fetchPresets = useCallback(() => {
    const params: { drone_profile_id?: string } = {};
    if (droneProfileId) params.drone_profile_id = droneProfileId;
    listCameraPresets(params)
      .then((res) => setPresets(res.data))
      .catch(() => setPresets([]));
  }, [droneProfileId]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // derive the applied preset from current camera fields so the dropdown
  // reflects a matching preset (e.g. the default loaded on MANUAL switch or
  // after reload) instead of "Apply a preset".
  useEffect(() => {
    if (cameraMode !== "MANUAL" || presets.length === 0) return;
    const match = presets.find(
      (p) =>
        (p.white_balance ?? null) === (defaultWhiteBalance ?? null)
        && (p.iso ?? null) === (defaultIso ?? null)
        && (p.shutter_speed ?? null) === (defaultShutterSpeed ?? null)
        && (p.focus_mode ?? null) === (defaultFocusMode ?? null),
    );
    setAppliedPresetId(match ? match.id : "");
  }, [cameraMode, presets, defaultWhiteBalance, defaultIso, defaultShutterSpeed, defaultFocusMode]);

  function handlePresetApply(presetId: string) {
    if (!presetId) {
      setAppliedPresetId("");
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setAppliedPresetId(preset.id);
    onChange({
      camera_mode: "MANUAL",
      default_white_balance: preset.white_balance ?? null,
      default_iso: preset.iso ?? null,
      default_shutter_speed: preset.shutter_speed ?? null,
      default_focus_mode: preset.focus_mode ?? null,
    });
  }

  function handleCameraModeChange(mode: "AUTO" | "MANUAL") {
    if (mode === cameraMode) return;
    if (mode === "AUTO") {
      onChange({ camera_mode: "AUTO" });
      return;
    }
    // MANUAL - if no fields set yet, preload from drone default preset
    const hasAny =
      defaultWhiteBalance || defaultIso || defaultShutterSpeed || defaultFocusMode;
    if (hasAny) {
      onChange({ camera_mode: "MANUAL" });
      return;
    }
    const def = presets.find((p) => p.is_default);
    if (def) {
      setAppliedPresetId(def.id);
      onChange({
        camera_mode: "MANUAL",
        default_white_balance: def.white_balance ?? null,
        default_iso: def.iso ?? null,
        default_shutter_speed: def.shutter_speed ?? null,
        default_focus_mode: def.focus_mode ?? null,
      });
    } else {
      onChange({ camera_mode: "MANUAL" });
    }
  }

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="mission-config-form">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">{t("mission.config.missionConfig")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
      {!collapsed && <div className="border-b border-tv-border -mx-4 mt-3" />}

      {!collapsed && (
      <div className={`space-y-3 mt-3${disabled ? " pointer-events-none opacity-60" : ""}`}>

      {/* drone profile */}
      <DroneProfileDropdown
        droneProfiles={droneProfiles}
        selectedId={droneProfileId ?? ""}
        onSelect={(id) => onChange({ drone_profile_id: id || null })}
      />

      {/* speed overrides + altitude offset */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.transitSpeedOverride")}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={defaultSpeed ?? ""}
            onChange={(e) =>
              onChange({ default_speed: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.transitSpeedOverrideHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="default-speed-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.measurementSpeedOverride")}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={measurementSpeedOverride ?? ""}
            onChange={(e) =>
              onChange({ measurement_speed_override: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.missionMeasurementSpeedHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="measurement-speed-override-input"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.defaultAltitudeOffset")}
          </label>
          <input
            type="number"
            step="0.1"
            value={defaultAltitudeOffset ?? ""}
            onChange={(e) =>
              onChange({ default_altitude_offset: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.defaultAltitudeOffsetHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="default-altitude-offset-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.transitAgl")}
          </label>
          <input
            type="number"
            step="0.5"
            min="5"
            value={transitAgl ?? ""}
            onChange={(e) =>
              onChange({ transit_agl: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.transitAglHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="transit-agl-input"
          />
        </div>
      </div>

      {/* capture mode + buffer distance */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.captureMode.defaultTitle")}
          </label>
          <select
            value={defaultCaptureMode ?? "VIDEO_CAPTURE"}
            onChange={(e) =>
              onChange({ default_capture_mode: e.target.value as CaptureMode })
            }
            className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
            data-testid="default-capture-mode-select"
          >
            <option value="VIDEO_CAPTURE">{t("mission.config.captureMode.video")}</option>
            <option value="PHOTO_CAPTURE">{t("mission.config.captureMode.photo")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.defaultBufferDistance")}
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={defaultBufferDistance ?? ""}
            onChange={(e) =>
              onChange({ default_buffer_distance: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.defaultBufferDistanceHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="default-buffer-distance-input"
          />
        </div>
      </div>

      {/* camera setting defaults */}
      <div data-testid="mission-camera-settings">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-tv-text-secondary">
            {t("mission.config.cameraSettings.title")}
          </label>
          <div className="inline-flex rounded-full border border-tv-border bg-tv-bg p-0.5 text-xs" data-testid="mission-camera-mode">
            {(["AUTO", "MANUAL"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleCameraModeChange(m)}
                className={`px-3 py-1 rounded-full transition-colors ${cameraMode === m ? "bg-tv-accent text-white font-medium" : "text-tv-text-secondary hover:text-tv-text-primary"}`}
                data-testid={`mission-camera-mode-${m.toLowerCase()}`}
              >
                {t(m === "AUTO" ? "mission.config.cameraSettings.modeAuto" : "mission.config.cameraSettings.modeManual")}
              </button>
            ))}
          </div>
        </div>
        {cameraMode === "AUTO" && (
          <p className="text-[11px] text-tv-text-muted leading-tight mb-1">
            {t("mission.config.cameraSettings.modeAutoHint")}
          </p>
        )}
        {cameraMode === "MANUAL" && presets.length > 0 && (
          <div className="mb-2">
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.presetLabel")}
            </label>
            <select
              value={appliedPresetId}
              onChange={(e) => handlePresetApply(e.target.value)}
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="mission-camera-preset-select"
            >
              <option value="">{t("mission.config.cameraSettings.applyPreset")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ` (${t("mission.config.cameraSettings.presetDefault")})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {cameraMode === "MANUAL" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("mission.config.cameraSettings.whiteBalance")}
            </label>
            <select
              value={defaultWhiteBalance ?? ""}
              onChange={(e) =>
                onChange({ default_white_balance: e.target.value || null })
              }
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="default-white-balance-select"
            >
              <option value="">{t("mission.config.cameraSettings.notSet")}</option>
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
              value={defaultIso ?? ""}
              onChange={(e) =>
                onChange({ default_iso: e.target.value ? parseInt(e.target.value) : null })
              }
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="default-iso-input"
            >
              <option value="">{t("mission.config.cameraSettings.notSet")}</option>
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
              value={defaultShutterSpeed ?? ""}
              onChange={(e) =>
                onChange({ default_shutter_speed: e.target.value || null })
              }
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="default-shutter-speed-input"
            >
              <option value="">{t("mission.config.cameraSettings.notSet")}</option>
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
              value={defaultFocusMode ?? ""}
              onChange={(e) =>
                onChange({ default_focus_mode: (e.target.value || null) as "AUTO" | "INFINITY" | null })
              }
              className="w-full appearance-none pl-3 pr-7 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              data-testid="default-focus-mode-select"
            >
              <option value="">{t("mission.config.cameraSettings.notSet")}</option>
              <option value="AUTO">{t("mission.config.cameraSettings.fm.auto")}</option>
              <option value="INFINITY">{t("mission.config.cameraSettings.fm.infinity")}</option>
            </select>
          </div>
        </div>
        )}
      </div>

      {/* mission toggles */}
      <div
        className="rounded-2xl border border-tv-border bg-tv-bg px-3 py-2.5 flex items-center gap-3"
        data-testid="use-takeoff-as-landing"
      >
        <span className="flex flex-col flex-1 min-w-0">
          <span className="text-xs font-medium text-tv-text-primary">
            {t("map.useTakeoffAsLanding")}
          </span>
          <span className="text-[11px] text-tv-text-muted leading-tight">
            {t("map.useTakeoffAsLandingHint")}
          </span>
        </span>
        <Toggle
          checked={useTakeoffAsLanding}
          onChange={() => {
            const next = !useTakeoffAsLanding;
            setUseTakeoffAsLanding(next);
            if (next && takeoff) {
              onChange({ landing_coordinate: takeoff });
            }
          }}
          disabled={disabled}
          data-testid="use-takeoff-as-landing-checkbox"
        />
      </div>
      <div
        className="rounded-2xl border border-tv-border bg-tv-bg px-3 py-2.5 flex items-center gap-3"
        data-testid="require-perpendicular-crossing"
      >
        <span className="flex flex-col flex-1 min-w-0">
          <span className="text-xs font-medium text-tv-text-primary">
            {t("mission.config.requirePerpendicularCrossing")}
          </span>
          <span className="text-[11px] text-tv-text-muted leading-tight">
            {t("mission.config.requirePerpendicularCrossingHint")}
          </span>
        </span>
        <Toggle
          checked={requirePerpendicularCrossing}
          onChange={() =>
            onChange({
              require_perpendicular_runway_crossing: !requirePerpendicularCrossing,
            })
          }
          disabled={disabled}
          data-testid="require-perpendicular-crossing-toggle"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-tv-border px-3 py-2.5">
          <CoordinateInput
            label={t("mission.config.takeoffCoordinate")}
            value={takeoff ?? null}
            onChange={(val: PointZ | null) => {
              if (useTakeoffAsLanding) {
                onChange({ takeoff_coordinate: val, landing_coordinate: val });
              } else {
                onChange({ takeoff_coordinate: val });
              }
            }}
            picking={pickingCoord === "takeoff"}
            onPickOnMap={onPickCoord ? () => onPickCoord(pickingCoord === "takeoff" ? null : "takeoff") : undefined}
            defaultAltitude={defaultAltitude}
          />
        </div>
        <div className="rounded-2xl border border-tv-border px-3 py-2.5">
          <CoordinateInput
            label={t("mission.config.landingCoordinate")}
            value={landing ?? null}
            onChange={(val: PointZ | null) => onChange({ landing_coordinate: val })}
            picking={pickingCoord === "landing"}
            onPickOnMap={
              useTakeoffAsLanding || !onPickCoord
                ? undefined
                : () => onPickCoord(pickingCoord === "landing" ? null : "landing")
            }
            defaultAltitude={defaultAltitude}
          />
        </div>
      </div>

      {/* flight plan scope */}
      <FlightPlanScopeSelector
        value={flightPlanScope}
        onChange={(scope) => onChange({ flight_plan_scope: scope })}
        disabled={disabled}
      />

      {/* airport boundary behavior */}
      <div
        className="rounded-2xl border border-tv-border bg-tv-bg px-3 py-2.5"
        data-testid="boundary-behavior-section"
      >
        <label className="text-xs font-semibold text-tv-text-secondary block mb-1">
          {t("mission.config.boundary.title")}
        </label>
        {!hasAirportBoundary && (
          <p
            className="text-[11px] text-tv-text-muted leading-tight mb-2"
            data-testid="boundary-no-zone-hint"
          >
            {t("mission.config.boundary.noBoundaryZone")}
          </p>
        )}

        <div className="mb-2">
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.boundary.constraintLabel")}
          </label>
          <div
            className="inline-flex w-full rounded-full border border-tv-border bg-tv-bg p-0.5 text-xs"
            role="radiogroup"
            aria-label={t("mission.config.boundary.constraintLabel")}
            data-testid="boundary-constraint-mode"
          >
            {(["NONE", "INSIDE", "OUTSIDE"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={boundaryConstraintMode === mode}
                disabled={disabled || !hasAirportBoundary}
                onClick={() => onChange({ boundary_constraint_mode: mode })}
                className={`flex-1 px-3 py-1 rounded-full transition-colors ${
                  boundaryConstraintMode === mode
                    ? "bg-tv-accent text-white font-medium"
                    : "text-tv-text-secondary hover:text-tv-text-primary"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                data-testid={`boundary-constraint-${mode.toLowerCase()}`}
              >
                {t(`mission.config.boundary.constraint.${mode.toLowerCase()}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("mission.config.boundary.preferenceLabel")}
          </label>
          <div
            className="inline-flex w-full rounded-full border border-tv-border bg-tv-bg p-0.5 text-xs"
            role="radiogroup"
            aria-label={t("mission.config.boundary.preferenceLabel")}
            data-testid="boundary-preference"
          >
            {(["DONT_CARE", "PREFER_INSIDE", "PREFER_OUTSIDE"] as const).map((pref) => (
              <button
                key={pref}
                type="button"
                role="radio"
                aria-checked={boundaryPreference === pref}
                disabled={
                  disabled
                  || !hasAirportBoundary
                  || boundaryConstraintMode !== "NONE"
                }
                onClick={() => onChange({ boundary_preference: pref })}
                className={`flex-1 px-3 py-1 rounded-full transition-colors ${
                  boundaryPreference === pref
                    ? "bg-tv-accent text-white font-medium"
                    : "text-tv-text-secondary hover:text-tv-text-primary"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                data-testid={`boundary-preference-${pref.toLowerCase()}`}
              >
                {t(`mission.config.boundary.preference.${pref.toLowerCase()}`)}
              </button>
            ))}
          </div>
          {hasAirportBoundary && boundaryConstraintMode !== "NONE" && (
            <p
              className="text-[11px] text-tv-text-muted leading-tight mt-1"
              data-testid="boundary-preference-disabled-hint"
            >
              {t("mission.config.boundary.preferenceSubsumedHint")}
            </p>
          )}
        </div>
      </div>

      {/* operator notes */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.operatorNotes")}
        </label>
        <textarea
          value={notes ?? ""}
          onChange={(e) => onChange({ operator_notes: e.target.value || null })}
          placeholder={t("mission.config.operatorNotesPlaceholder")}
          rows={2}
          className="w-full px-3 py-2 rounded-2xl text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors resize-none"
          data-testid="operator-notes-textarea"
        />
      </div>
      </div>
      )}
    </div>
  );
}
