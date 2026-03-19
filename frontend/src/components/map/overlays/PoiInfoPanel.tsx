import { useTranslation } from "react-i18next";
import type { MapFeature } from "@/types/map";

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
            <InfoRow
              label={t("dashboard.poiCoordinates")}
              value={`${o.position.coordinates[1].toFixed(6)}, ${o.position.coordinates[0].toFixed(6)}`}
            />
          </>
        );
      }
      case "safety_zone": {
        const z = feature.data;
        return (
          <>
            <InfoRow label={t("dashboard.poiName")} value={z.name} />
            <InfoRow label={t("dashboard.poiType")} value={z.type} />
            <InfoRow label={t("dashboard.poiActive")} value={z.is_active ? "Yes" : "No"} />
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
            <InfoRow
              label={t("dashboard.poiCoordinates")}
              value={`${a.position.coordinates[1].toFixed(6)}, ${a.position.coordinates[0].toFixed(6)}`}
            />
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
            <InfoRow
              label={t("dashboard.poiCoordinates")}
              value={`${l.position.coordinates[1].toFixed(6)}, ${l.position.coordinates[0].toFixed(6)}`}
            />
          </>
        );
      }
    }
  }

  return (
    <div
      className="absolute bottom-3 left-3 z-10 min-w-[200px] max-w-[280px] rounded-2xl border border-tv-border bg-tv-surface/95 backdrop-blur-sm"
      data-testid="poi-info-panel"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-tv-text-primary">
          {t("dashboard.poiInfo")}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-0.5 text-tv-text-secondary hover:bg-tv-surface-hover"
          aria-label={t("common.close")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
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
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-tv-text-muted whitespace-nowrap">{label}</span>
      <span className="text-tv-text-primary text-right font-medium truncate">
        {value}
      </span>
    </div>
  );
}
