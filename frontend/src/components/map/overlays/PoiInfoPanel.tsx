import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import FeatureInfoPanel from "@/components/common/FeatureInfoPanel";
import { ChevronDown } from "lucide-react";
import type { MapFeature } from "@/types/map";
import type { PointZ, PolygonZ } from "@/types/common";

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
                value={`${s.length}${t("common.units.m")} x ${s.width}${t("common.units.m")}`}
              />
            )}
            {s.boundary && (
              <PolygonCoordRows polygon={s.boundary} label={t("dashboard.poiCoordinates")} />
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
            <InfoRow label={t("dashboard.poiHeight")} value={`${o.height}${t("common.units.m")}`} />
            <InfoRow label={t("dashboard.bufferDistance")} value={`${o.buffer_distance}${t("common.units.m")}`} />
            <PolygonCoordRows polygon={o.boundary} label={t("dashboard.poiCoordinates")} />
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
              <InfoRow label={t("dashboard.poiFloor")} value={`${z.altitude_floor}${t("common.units.m")}`} />
            )}
            {z.altitude_ceiling != null && (
              <InfoRow label={t("dashboard.poiCeiling")} value={`${z.altitude_ceiling}${t("common.units.m")}`} />
            )}
            <PolygonCoordRows polygon={z.geometry} label={t("dashboard.poiCoordinates")} />
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
                  value={`${w.alt_min.toFixed(1)}${t("common.units.m")} - ${w.alt_max.toFixed(1)}${t("common.units.m")}`}
                />
              )}
              <CoordRows position={w.position} label={t("dashboard.poiCoordinates")} />
              {w.heading != null && (
                <InfoRow label={t("mission.config.heading")} value={`${w.heading.toFixed(1)}\u00B0`} />
              )}
              {w.speed != null && (
                <InfoRow label={t("mission.config.speed")} value={`${w.speed} ${t("common.units.ms")}`} />
              )}
              <InfoRow
                label={t("mission.config.cameraAction")}
                value={w.camera_action
                  ? t(`map.cameraActionLabel.${w.camera_action}`, { defaultValue: w.camera_action })
                  : "\u2014"}
              />
              {w.gimbal_pitch != null && (
                <InfoRow label={t("mission.config.gimbalPitch")} value={`${w.gimbal_pitch.toFixed(1)}\u00B0`} />
              )}
              {w.camera_target && (
                <CoordRows position={w.camera_target} label={t("map.cameraTarget")} />
              )}
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
            {w.heading != null && (
              <InfoRow label={t("mission.config.heading")} value={`${w.heading.toFixed(1)}\u00B0`} />
            )}
            {w.speed != null && (
              <InfoRow label={t("mission.config.speed")} value={`${w.speed} ${t("common.units.ms")}`} />
            )}
            <InfoRow
              label={t("mission.config.cameraAction")}
              value={w.camera_action
                ? t(`map.cameraActionLabel.${w.camera_action}`, { defaultValue: w.camera_action })
                : "\u2014"}
            />
            {w.gimbal_pitch != null && (
              <InfoRow label={t("mission.config.gimbalPitch")} value={`${w.gimbal_pitch.toFixed(1)}\u00B0`} />
            )}
            {w.camera_target && (
              <CoordRows position={w.camera_target} label={t("map.cameraTarget")} />
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
    <div className="w-full flex-shrink-0" data-testid="poi-info-panel">
      <FeatureInfoPanel title={t("dashboard.poiInfo")} onClose={onClose}>
        <div className="space-y-1">{renderContent()}</div>
      </FeatureInfoPanel>
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
            <span className="text-tv-text-primary font-medium">{alt.toFixed(1)}{t("common.units.m")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PolygonCoordRows({ polygon, label }: { polygon: PolygonZ; label: string }) {
  /** polygon centroid + expandable vertex list. */
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return null;

  // skip closing vertex if it matches the first
  const vertices = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
    ? ring.slice(0, -1)
    : ring;

  const centLon = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
  const centLat = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;

  return (
    <div className="text-xs">
      <div className="text-tv-text-muted">{label}:</div>
      <div className="mt-0.5 pl-2 space-y-0.5">
        <div className="text-tv-text-muted text-[10px]">{t("map.centroid")}</div>
        <div className="flex justify-between">
          <span className="text-tv-text-muted">{t("map.coordinates.lat")}</span>
          <span className="text-tv-text-primary font-medium">{centLat.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tv-text-muted">{t("map.coordinates.lon")}</span>
          <span className="text-tv-text-primary font-medium">{centLon.toFixed(6)}</span>
        </div>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 flex items-center gap-1 text-tv-text-muted hover:text-tv-text-secondary transition-colors"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <span>{t("map.vertices")} ({vertices.length})</span>
      </button>
      {expanded && (
        <div className="pl-2 mt-0.5 space-y-1 max-h-32 overflow-y-auto">
          {vertices.map((v, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="text-tv-text-muted">#{i + 1}</span>
              <span className="text-tv-text-primary font-medium">
                {v[1].toFixed(6)}, {v[0].toFixed(6)}
              </span>
            </div>
          ))}
        </div>
      )}
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
          {value.toFixed(decimals)}{fieldName === "alt" ? t("common.units.m") : ""}
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
