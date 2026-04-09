import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MissionDetailResponse, MissionUpdate } from "@/types/mission";
import type { CaptureMode } from "@/types/enums";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { PointZ } from "@/types/common";
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
  /** custom dropdown for drone profile selection with manufacturer and endurance. */
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      /** close on outside click. */
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = droneProfiles.find((dp) => dp.id === selectedId);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
        {t("mission.config.droneProfile")}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full text-left pl-3 pr-7 py-2.5 rounded-full text-sm border bg-tv-bg text-tv-text-primary transition-colors ${
          open ? "border-tv-accent" : "border-tv-border hover:bg-tv-surface-hover"
        }`}
        data-testid="drone-profile-select"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate">
            {selected ? selected.name : t("mission.config.selectDrone")}
          </span>
          {selected?.manufacturer && (
            <span className="text-xs text-tv-text-muted flex-shrink-0">{selected.manufacturer}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-tv-text-secondary flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl border border-tv-border bg-tv-surface z-50 max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onSelect(""); setOpen(false); }}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
              !selectedId ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-muted hover:bg-tv-surface-hover"
            }`}
          >
            {t("mission.config.selectDrone")}
          </button>
          {droneProfiles.map((dp) => {
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
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate flex-1 ${isSelected ? "font-medium" : "text-tv-text-primary"}`}>
                    {dp.name}
                  </span>
                </div>
                <div className={`flex items-center gap-3 text-xs mt-0.5 ${isSelected ? "text-tv-accent-text/70" : "text-tv-text-muted"}`}>
                  {dp.manufacturer && <span>{dp.manufacturer}</span>}
                  {dp.endurance_minutes != null && (
                    <span>{dp.endurance_minutes} min</span>
                  )}
                </div>
              </button>
            );
          })}
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
}: MissionConfigFormProps) {
  /** mission-level configuration form with coordinate pick-on-map support. */
  const { t } = useTranslation();

  const droneProfileId =
    values.drone_profile_id !== undefined
      ? values.drone_profile_id
      : mission.drone_profile_id;
  const defaultSpeed =
    values.default_speed !== undefined
      ? values.default_speed
      : mission.default_speed;
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
      <div className="space-y-4 mt-3">

      {/* drone profile */}
      <DroneProfileDropdown
        droneProfiles={droneProfiles}
        selectedId={droneProfileId ?? ""}
        onSelect={(id) => onChange({ drone_profile_id: id || null })}
      />

      {/* default speed */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.defaultSpeed")}
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={defaultSpeed ?? ""}
          onChange={(e) =>
            onChange({
              default_speed: e.target.value ? parseFloat(e.target.value) : null,
            })
          }
          className="w-full px-3 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
          data-testid="default-speed-input"
        />
      </div>

      {/* default altitude offset */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.defaultAltitudeOffset")}
        </label>
        <input
          type="number"
          step="0.1"
          value={defaultAltitudeOffset ?? ""}
          onChange={(e) =>
            onChange({
              default_altitude_offset: e.target.value
                ? parseFloat(e.target.value)
                : null,
            })
          }
          className="w-full px-3 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
          data-testid="default-altitude-offset-input"
        />
      </div>

      {/* default capture mode */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.captureMode.defaultTitle")}
        </label>
        <select
          value={defaultCaptureMode ?? "VIDEO_CAPTURE"}
          onChange={(e) =>
            onChange({
              default_capture_mode: e.target.value as CaptureMode,
            })
          }
          className="w-full appearance-none pl-3 pr-7 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
          data-testid="default-capture-mode-select"
        >
          <option value="VIDEO_CAPTURE">{t("mission.config.captureMode.video")}</option>
          <option value="PHOTO_CAPTURE">{t("mission.config.captureMode.photo")}</option>
        </select>
      </div>

      {/* default buffer distance */}
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
            onChange({
              default_buffer_distance: e.target.value ? parseFloat(e.target.value) : null,
            })
          }
          placeholder={t("mission.config.defaultBufferDistanceHint")}
          className="w-full px-3 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
          data-testid="default-buffer-distance-input"
        />
      </div>

      {/* takeoff coordinate */}
      <CoordinateInput
        label={t("mission.config.takeoffCoordinate")}
        value={takeoff ?? null}
        onChange={(val: PointZ | null) =>
          onChange({ takeoff_coordinate: val })
        }
        picking={pickingCoord === "takeoff"}
        onPickOnMap={onPickCoord ? () => onPickCoord(pickingCoord === "takeoff" ? null : "takeoff") : undefined}
        defaultAltitude={defaultAltitude}
      />

      {/* landing coordinate */}
      <CoordinateInput
        label={t("mission.config.landingCoordinate")}
        value={landing ?? null}
        onChange={(val: PointZ | null) =>
          onChange({ landing_coordinate: val })
        }
        picking={pickingCoord === "landing"}
        onPickOnMap={onPickCoord ? () => onPickCoord(pickingCoord === "landing" ? null : "landing") : undefined}
        defaultAltitude={defaultAltitude}
      />

      {/* operator notes */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.operatorNotes")}
        </label>
        <textarea
          value={notes ?? ""}
          onChange={(e) =>
            onChange({
              operator_notes: e.target.value || null,
            })
          }
          placeholder={t("mission.config.operatorNotesPlaceholder")}
          rows={3}
          className="w-full px-4 py-2.5 rounded-2xl text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors resize-none"
          data-testid="operator-notes-textarea"
        />
      </div>
      </div>
      )}
    </div>
  );
}
