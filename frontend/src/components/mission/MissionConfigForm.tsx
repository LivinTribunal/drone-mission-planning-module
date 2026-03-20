import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MissionDetailResponse, MissionUpdate } from "@/types/mission";
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
}

export default function MissionConfigForm({
  mission,
  droneProfiles,
  values,
  onChange,
  pickingCoord,
  onPickCoord,
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

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="mission-config-form">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
      >
        <span>{t("mission.config.missionConfig")}</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {!collapsed && (
      <div className="space-y-4 mt-3">

      {/* drone profile */}
      <div>
        <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
          {t("mission.config.droneProfile")}
        </label>
        <select
          value={droneProfileId ?? ""}
          onChange={(e) =>
            onChange({
              drone_profile_id: e.target.value || null,
            })
          }
          className="w-full appearance-none pl-3 pr-7 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23888%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
          data-testid="drone-profile-select"
        >
          <option value="">{t("mission.config.selectDrone")}</option>
          {droneProfiles.map((dp) => (
            <option key={dp.id} value={dp.id}>
              {dp.name}
            </option>
          ))}
        </select>
      </div>

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

      {/* takeoff coordinate */}
      <CoordinateInput
        label={t("mission.config.takeoffCoordinate")}
        value={takeoff ?? null}
        onChange={(val: PointZ | null) =>
          onChange({ takeoff_coordinate: val })
        }
        picking={pickingCoord === "takeoff"}
        onPickOnMap={onPickCoord ? () => onPickCoord(pickingCoord === "takeoff" ? null : "takeoff") : undefined}
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
