import { useTranslation } from "react-i18next";
import type { WaypointResponse } from "@/types/flightPlan";

interface WaypointInfoPanelProps {
  waypoint: WaypointResponse | null;
}

export default function WaypointInfoPanel({
  waypoint,
}: WaypointInfoPanelProps) {
  const { t } = useTranslation();

  if (!waypoint) {
    return (
      <div
        className="bg-tv-surface border border-tv-border rounded-2xl px-3 py-2"
        data-testid="waypoint-info-panel"
      >
        <p className="text-xs text-tv-text-muted">
          {t("mission.config.selectWaypoint")}
        </p>
      </div>
    );
  }

  const [lon, lat, alt] = waypoint.position.coordinates;

  const fields = [
    { label: t("mission.config.sequence"), value: waypoint.sequence_order },
    { label: t("mission.config.type"), value: waypoint.waypoint_type.replace(/_/g, " ") },
    {
      label: t("mission.config.position"),
      value: `${lat.toFixed(6)}, ${lon.toFixed(6)}, ${alt.toFixed(1)}m`,
    },
    {
      label: t("mission.config.heading"),
      value: waypoint.heading != null ? `${waypoint.heading.toFixed(1)}°` : "\u2014",
    },
    {
      label: t("mission.config.speed"),
      value: waypoint.speed != null ? `${waypoint.speed} m/s` : "\u2014",
    },
    {
      label: t("mission.config.cameraAction"),
      value: waypoint.camera_action
        ? t(`map.cameraActionLabel.${waypoint.camera_action}`, { defaultValue: waypoint.camera_action })
        : "\u2014",
    },
    {
      label: t("mission.config.gimbalPitch"),
      value:
        waypoint.gimbal_pitch != null
          ? `${waypoint.gimbal_pitch.toFixed(1)}°`
          : "\u2014",
    },
  ];

  return (
    <div
      className="bg-tv-surface border border-tv-border rounded-2xl px-3 py-2"
      data-testid="waypoint-info-panel"
    >
      <h4 className="text-xs font-semibold text-tv-text-primary mb-1.5">
        {t("mission.config.waypointInfo")}
      </h4>
      <div className="space-y-1">
        {fields.map((f) => (
          <div key={f.label} className="flex justify-between text-xs">
            <span className="text-tv-text-muted">{f.label}</span>
            <span className="text-tv-text-primary font-medium">{f.value}</span>
          </div>
        ))}
        {waypoint.camera_target && (
          <div className="text-xs">
            <div className="text-tv-text-muted">{t("map.cameraTarget")}:</div>
            <div className="mt-0.5 pl-2 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-tv-text-muted">{t("map.coordinates.lat")}</span>
                <span className="text-tv-text-primary font-medium">{waypoint.camera_target.coordinates[1].toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tv-text-muted">{t("map.coordinates.lon")}</span>
                <span className="text-tv-text-primary font-medium">{waypoint.camera_target.coordinates[0].toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tv-text-muted">{t("map.coordinates.alt")}</span>
                <span className="text-tv-text-primary font-medium">{waypoint.camera_target.coordinates[2].toFixed(1)}m</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
