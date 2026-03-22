import { useTranslation } from "react-i18next";
import type { MapFeature } from "@/types/map";
import type { PointZ } from "@/types/common";

interface PoiInfoPanelProps {
  feature: MapFeature | null;
  onClose: () => void;
}

export default function PoiInfoPanel({ feature, onClose }: PoiInfoPanelProps) {
  const { t } = useTranslation();

  if (!feature) return null;

  function renderContent() {
    if (!feature) return null;

    switch (feature.type) {
      case "surface": {
        const s = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiIdentifier")} value={s.identifier} />
            <InfoRow label={t("dashboard.poiType")} value={s.surface_type} />
            {s.heading != null && (
              <InfoRow label={t("dashboard.poiHeading")} value={`${s.heading}\u00B0`} />
            )}
            {s.length != null && s.width != null && (
              <InfoRow
                label={t("dashboard.poiDimensions")}
                value={`${s.length}m x ${s.width}m`}
              />
            )}
          </>
        );
      }
      case "obstacle": {
        const o = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiName")} value={o.name} />
            <InfoRow label={t("dashboard.poiType")} value={o.type} />
            <InfoRow label={t("dashboard.poiHeight")} value={`${o.height}m`} />
            <InfoRow label={t("dashboard.poiRadius")} value={`${o.radius}m`} />
            <CoordRows position={o.position} label={t("dashboard.poiCoordinates")} />
          </>
        );
      }
      case "safety_zone": {
        const z = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiName")} value={z.name} />
            <InfoRow label={t("dashboard.poiType")} value={z.type} />
            <InfoRow label={t("dashboard.poiActive")} value={z.is_active ? t("common.yes") : t("common.no")} />
            {z.altitude_floor != null && (
              <InfoRow label={t("dashboard.poiFloor")} value={`${z.altitude_floor}m`} />
            )}
            {z.altitude_ceiling != null && (
              <InfoRow label={t("dashboard.poiCeiling")} value={`${z.altitude_ceiling}m`} />
            )}
          </>
        );
      }
      case "agl": {
        const a = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiName")} value={a.name} />
            <InfoRow label={t("dashboard.poiType")} value={a.agl_type} />
            {a.side && <InfoRow label={t("dashboard.poiSide")} value={a.side} />}
            <CoordRows position={a.position} label={t("dashboard.poiCoordinates")} />
          </>
        );
      }
      case "lha": {
        const l = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiUnitNumber")} value={String(l.unit_number)} />
            <InfoRow label={t("dashboard.poiLampType")} value={l.lamp_type} />
            <InfoRow
              label={t("dashboard.poiSettingAngle")}
              value={`${l.setting_angle}\u00B0`}
            />
            <CoordRows position={l.position} label={t("dashboard.poiCoordinates")} />
          </>
        );
      }
      case "waypoint": {
        const w = feature.data;
        if (w.stack_count > 1) {
          return (
            <>
              <InfoRow label={t("mission.config.type")} value={w.waypoint_type.replace(/_/g, " ")} />
              <InfoRow
                label={t("dashboard.waypoints")}
                value={w.seq_min != null && w.seq_max != null ? `${w.seq_min}-${w.seq_max} (${w.stack_count})` : String(w.stack_count)}
              />
              {w.alt_min != null && w.alt_max != null && (
                <InfoRow
                  label={t("dashboard.poiAltitude")}
                  value={`${w.alt_min.toFixed(1)}m - ${w.alt_max.toFixed(1)}m`}
                />
              )}
              <CoordRows position={w.position} label={t("dashboard.poiCoordinates")} />
            </>
          );
        }
        return (
          <>
            <InfoRow label={t("mission.config.type")} value={w.waypoint_type.replace(/_/g, " ")} />
            <InfoRow label={t("mission.config.sequence")} value={String(w.sequence_order)} />
            <CoordRows position={w.position} label={t("dashboard.poiCoordinates")} />
          </>
        );
      }
    }
  }

  return (
    <div
      className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
      data-testid="poi-info-panel"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("dashboard.poiInfo")}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 bg-tv-surface border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
          aria-label={t("common.close")}
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="border-t border-tv-border px-3 pb-3 pt-2 space-y-1">
        {renderContent()}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  /** single label-value row. */
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-tv-text-muted whitespace-nowrap">{label}</span>
      <span className="text-tv-text-primary text-right font-medium truncate">
        {value}
      </span>
    </div>
  );
}

function CoordRows({ position, label }: { position: PointZ; label: string }) {
  /** stacked coordinate display showing lat, lon, alt on separate lines. */
  const [lon, lat, alt] = position.coordinates;
  return (
    <div className="text-xs">
      <div className="text-tv-text-muted">{label}:</div>
      <div className="mt-0.5 pl-2 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-tv-text-muted">Lat</span>
          <span className="text-tv-text-primary font-medium">{lat.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tv-text-muted">Lon</span>
          <span className="text-tv-text-primary font-medium">{lon.toFixed(6)}</span>
        </div>
        {alt != null && alt !== 0 && (
          <div className="flex justify-between">
            <span className="text-tv-text-muted">Alt</span>
            <span className="text-tv-text-primary font-medium">{alt.toFixed(1)}m</span>
          </div>
        )}
      </div>
    </div>
  );
}
