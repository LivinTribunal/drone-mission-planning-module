import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
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
  disabled?: boolean;
  // optional controlled mirror-mode state - when omitted the checkbox is
  // self-contained; the parent lifts this when pick-on-map also needs to mirror
  useTakeoffAsLanding?: boolean;
  onUseTakeoffAsLandingChange?: (value: boolean) => void;
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
  const transitAgl =
    values.transit_agl !== undefined
      ? values.transit_agl
      : mission.transit_agl;

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

      {/* speed + altitude offset */}
      <div className="grid grid-cols-2 gap-2">
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
              onChange({ default_speed: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder={t("mission.config.defaultSpeedHint")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="default-speed-input"
          />
        </div>
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

      {/* transit height */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.transitAgl")}
        </label>
        <input
          type="number"
          step="0.5"
          min="1"
          value={transitAgl ?? ""}
          onChange={(e) =>
            onChange({ transit_agl: e.target.value ? parseFloat(e.target.value) : null })
          }
          placeholder={t("mission.config.transitAglHint")}
          className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
          data-testid="transit-agl-input"
        />
      </div>

      {/* takeoff + landing */}
      {!disabled && (!takeoff || !landing) && (
        <label
          className="flex items-start gap-2 text-xs text-tv-text-primary cursor-pointer"
          data-testid="use-takeoff-as-landing"
        >
          <input
            type="checkbox"
            className="mt-0.5 accent-tv-accent"
            checked={useTakeoffAsLanding}
            onChange={() => {
              const next = !useTakeoffAsLanding;
              setUseTakeoffAsLanding(next);
              if (next && takeoff) {
                onChange({ landing_coordinate: takeoff });
              }
            }}
            data-testid="use-takeoff-as-landing-checkbox"
          />
          <span className="flex flex-col">
            <span className="font-semibold">{t("map.useTakeoffAsLanding")}</span>
            <span className="text-tv-text-secondary">{t("map.useTakeoffAsLandingHint")}</span>
          </span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
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
