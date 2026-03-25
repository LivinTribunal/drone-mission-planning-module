import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { MapFeature } from "@/types/map";
import type { PointZ } from "@/types/common";

interface PoiInfoPanelProps {
  feature: MapFeature | null;
  onClose: () => void;
  editable?: boolean;
  onCoordinateChange?: (waypointId: string, lat: number, lon: number, alt: number) => void;
  onDeleteTakeoffLanding?: (waypointType: string) => void;
}

export default function PoiInfoPanel({
  feature,
  onClose,
  editable = false,
  onCoordinateChange,
  onDeleteTakeoffLanding,
}: PoiInfoPanelProps) {
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
        const canDelete = w.waypoint_type === "TAKEOFF" || w.waypoint_type === "LANDING";

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
            {editable && onCoordinateChange ? (
              <EditableCoordRows
                position={w.position}
                label={t("dashboard.poiCoordinates")}
                onSave={(lat, lon, alt) => onCoordinateChange(w.id, lat, lon, alt)}
              />
            ) : (
              <CoordRows position={w.position} label={t("dashboard.poiCoordinates")} />
            )}
            {editable && canDelete && onDeleteTakeoffLanding && (
              <DeleteButton
                waypointType={w.waypoint_type}
                onDelete={() => onDeleteTakeoffLanding(w.waypoint_type)}
              />
            )}
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
  const { t } = useTranslation();
  const [lon, lat, alt] = position.coordinates;
  return (
    <div className="text-xs">
      <div className="text-tv-text-muted">{label}:</div>
      <div className="mt-0.5 pl-2 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-tv-text-muted">{t("map.coordinates.lat")}</span>
          <span className="text-tv-text-primary font-medium">{lat.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tv-text-muted">{t("map.coordinates.lon")}</span>
          <span className="text-tv-text-primary font-medium">{lon.toFixed(6)}</span>
        </div>
        {alt != null && alt !== 0 && (
          <div className="flex justify-between">
            <span className="text-tv-text-muted">{t("map.coordinates.alt")}</span>
            <span className="text-tv-text-primary font-medium">{alt.toFixed(1)}m</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableCoordRows({
  position,
  label,
  onSave,
}: {
  position: PointZ;
  label: string;
  onSave: (lat: number, lon: number, alt: number) => void;
}) {
  /** editable coordinate fields with inline inputs. */
  const { t } = useTranslation();
  const [lon, lat, alt] = position.coordinates;
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = useCallback((field: string, value: number) => {
    setEditingField(field);
    setEditValue(String(value));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingField) return;
    const val = parseFloat(editValue);
    if (isNaN(val)) {
      setEditingField(null);
      return;
    }

    if (editingField === "lat" && (val < -90 || val > 90)) {
      setEditingField(null);
      return;
    }
    if (editingField === "lon" && (val < -180 || val > 180)) {
      setEditingField(null);
      return;
    }

    const newLat = editingField === "lat" ? val : lat;
    const newLon = editingField === "lon" ? val : lon;
    const newAlt = editingField === "alt" ? val : alt;
    onSave(newLat, newLon, newAlt);
    setEditingField(null);
  }, [editingField, editValue, lat, lon, alt, onSave]);

  function renderField(fieldName: string, fieldLabel: string, value: number, decimals: number) {
    if (editingField === fieldName) {
      return (
        <div className="flex justify-between items-center">
          <span className="text-tv-text-muted">{fieldLabel}</span>
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditingField(null);
            }}
            className="w-24 text-right text-xs font-medium bg-tv-bg border border-tv-accent rounded px-1 py-0.5 outline-none text-tv-text-primary"
            autoFocus
          />
        </div>
      );
    }
    return (
      <div className="flex justify-between">
        <span className="text-tv-text-muted">{fieldLabel}</span>
        <button
          onClick={() => startEdit(fieldName, value)}
          className="text-tv-text-primary font-medium hover:text-tv-accent transition-colors cursor-text"
          title={t("common.edit")}
        >
          {value.toFixed(decimals)}{fieldName === "alt" ? "m" : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <div className="text-tv-text-muted">{label}:</div>
      <div className="mt-0.5 pl-2 space-y-0.5">
        {renderField("lat", t("map.coordinates.lat"), lat, 6)}
        {renderField("lon", t("map.coordinates.lon"), lon, 6)}
        {renderField("alt", t("map.coordinates.alt"), alt, 1)}
      </div>
    </div>
  );
}

function DeleteButton({
  waypointType,
  onDelete,
}: {
  waypointType: string;
  onDelete: () => void;
}) {
  /** delete button for takeoff/landing with confirmation. */
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-xs text-tv-text-secondary">
          {t("map.deleteConfirm", { type: waypointType.toLowerCase() })}
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={onDelete}
            className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-error text-tv-error hover:bg-tv-error hover:text-white transition-colors"
          >
            {t("common.delete")}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="mt-2 w-full rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-error text-tv-error hover:bg-tv-error hover:text-white transition-colors"
      data-testid="delete-waypoint-btn"
    >
      {t("common.delete")} {waypointType.toLowerCase()}
    </button>
  );
}
