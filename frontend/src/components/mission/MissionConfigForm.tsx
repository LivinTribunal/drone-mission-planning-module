import { useTranslation } from "react-i18next";
import type { MissionDetailResponse, MissionUpdate } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { PointZ } from "@/types/common";
import CoordinateInput from "./CoordinateInput";

interface MissionConfigFormProps {
  mission: MissionDetailResponse;
  droneProfiles: DroneProfileResponse[];
  values: Partial<MissionUpdate>;
  onChange: (update: Partial<MissionUpdate>) => void;
}

export default function MissionConfigForm({
  mission,
  droneProfiles,
  values,
  onChange,
}: MissionConfigFormProps) {
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

  return (
    <div className="space-y-4" data-testid="mission-config-form">
      <h3 className="text-sm font-semibold text-tv-text-primary">
        {t("mission.config.missionConfig")}
      </h3>

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
          className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
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
          className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
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
          className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
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
      />

      {/* landing coordinate */}
      <CoordinateInput
        label={t("mission.config.landingCoordinate")}
        value={landing ?? null}
        onChange={(val: PointZ | null) =>
          onChange({ landing_coordinate: val })
        }
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
  );
}
