import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, RotateCcw, Plus, Calculator } from "lucide-react";
import Input from "@/components/common/Input";
import FeatureInfoPanel from "@/components/common/FeatureInfoPanel";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import type { MapFeature } from "@/types/map";
import type {
  SurfaceResponse,
  SurfaceRecalculateResponse,
  ObstacleRecalculateResponse,
} from "@/types/airport";
import type { PointZ } from "@/types/common";
import { recalculateSurface, recalculateObstacle } from "@/api/airports";

interface EditableFeatureInfoProps {
  feature: MapFeature;
  onUpdate: (data: Record<string, unknown>) => void;
  onClose: () => void;
  airportId?: string;
  surfaces?: SurfaceResponse[];
  onDelete?: (featureType: string, id: string) => void;
  deleteWarnings?: string[];
  onAddLha?: (aglId: string) => void;
}

type RecalcPreview =
  | { kind: "surface"; data: SurfaceRecalculateResponse }
  | { kind: "obstacle"; data: ObstacleRecalculateResponse };

export default function EditableFeatureInfo({
  feature,
  onUpdate,
  onClose,
  airportId,
  surfaces,
  onDelete,
  deleteWarnings,
  onAddLha,
}: EditableFeatureInfoProps) {
  /** editable feature info panel for selected map features. */
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, unknown>>(
    feature.data as unknown as Record<string, unknown>,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recalcPreview, setRecalcPreview] = useState<RecalcPreview | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  useEffect(() => {
    setFormData(feature.data as unknown as Record<string, unknown>);
    setRecalcPreview(null);
    setRecalcError(null);
    setDeleteError(null);
  }, [feature]);

  async function handleRecalculate() {
    /** call backend to recompute dimensions and show side-by-side preview. */
    if (!airportId) return;
    setRecalcLoading(true);
    setRecalcError(null);
    try {
      if (feature.type === "surface") {
        const data = await recalculateSurface(airportId, String(formData.id));
        setRecalcPreview({ kind: "surface", data });
      } else if (feature.type === "obstacle") {
        const data = await recalculateObstacle(airportId, String(formData.id));
        setRecalcPreview({ kind: "obstacle", data });
      }
    } catch {
      setRecalcError(t("coordinator.detail.recalculateError"));
    } finally {
      setRecalcLoading(false);
    }
  }

  function handleApplyRecalculate() {
    /** apply recalculated dimensions via the standard update path. */
    if (!recalcPreview) return;
    // obstacle preview is read-only - obstacles have no length/width columns
    if (recalcPreview.kind !== "surface") {
      setRecalcPreview(null);
      return;
    }
    const recalculated = recalcPreview.data.recalculated;
    const updates: Record<string, unknown> = {};
    if (recalculated.length != null) updates.length = recalculated.length;
    if (recalculated.width != null) updates.width = recalculated.width;
    if (recalculated.heading != null) updates.heading = recalculated.heading;
    setFormData((prev) => ({ ...prev, ...updates }));
    onUpdate(updates);
    setRecalcPreview(null);
  }

  function val(key: string): string {
    /** get form field value as string for input binding. */
    const v = formData[key];
    if (v == null) return "";
    return String(v);
  }

  function handleChange(field: string, value: string | number | boolean | null) {
    /** propagate field change to parent. */
    setFormData((prev) => ({ ...prev, [field]: value }));
    onUpdate({ [field]: value });
  }

  return (
    <div data-testid="editable-feature-info">
      <FeatureInfoPanel
        title={t("coordinator.detail.featureInfo")}
        onClose={onClose}
      >
      <div className="flex flex-col gap-1.5 [&_input]:!px-3 [&_input]:!py-1.5 [&_input]:!text-xs">
        {feature.type === "surface" && (
          <>
            <Input
              id="feat-identifier"
              label={t("coordinator.detail.surfaceIdentifier")}
              value={val("identifier")}
              onChange={(e) => handleChange("identifier", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.surfaceType")}
              </label>
              <select
                value={val("surface_type")}
                onChange={(e) => handleChange("surface_type", e.target.value)}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="RUNWAY">{t("coordinator.detail.surfaceTypes.runway")}</option>
                <option value="TAXIWAY">{t("coordinator.detail.surfaceTypes.taxiway")}</option>
              </select>
            </div>
            <Input
              id="feat-heading"
              label={t("coordinator.detail.surfaceHeading")}
              type="number"
              value={val("heading")}
              onChange={(e) => handleChange("heading", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
            {val("heading") && (
              <div className="flex items-center gap-2">
                <svg className="h-6 w-6 flex-shrink-0" viewBox="0 0 24 24">
                  <line
                    x1="12" y1="20" x2="12" y2="4"
                    stroke="var(--tv-accent)" strokeWidth="2" strokeLinecap="round"
                    transform={`rotate(${parseFloat(val("heading"))}, 12, 12)`}
                  />
                  <polygon
                    points="12,2 9,8 15,8"
                    fill="var(--tv-accent)"
                    transform={`rotate(${parseFloat(val("heading"))}, 12, 12)`}
                  />
                </svg>
                <span className="text-[10px] text-tv-text-muted">
                  {Math.round(parseFloat(val("heading")))}°
                </span>
                <button
                  onClick={() => {
                    const current = parseFloat(val("heading"));
                    if (!isNaN(current)) handleChange("heading", (current + 180) % 360);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
                  title={t("coordinator.detail.oppositeHeading")}
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("coordinator.detail.opposite")}
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                id="feat-length"
                label={t("coordinator.detail.surfaceLength")}
                type="number"
                value={val("length")}
                onChange={(e) => handleChange("length", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
              <Input
                id="feat-width"
                label={t("coordinator.detail.surfaceWidth")}
                type="number"
                value={val("width")}
                onChange={(e) => handleChange("width", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            </div>
            {airportId && (
              <RecalculateBlock
                loading={recalcLoading}
                error={recalcError}
                preview={recalcPreview}
                onRecalculate={handleRecalculate}
                onApply={handleApplyRecalculate}
                onCancel={() => setRecalcPreview(null)}
              />
            )}
          </>
        )}

        {feature.type === "obstacle" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.obstacleName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.obstacleType")}
              </label>
              <select
                value={val("type")}
                onChange={(e) => handleChange("type", e.target.value)}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="BUILDING">{t("coordinator.detail.obstacleTypes.building")}</option>
                <option value="ANTENNA">{t("coordinator.detail.obstacleTypes.antenna")}</option>
                <option value="VEGETATION">{t("coordinator.detail.obstacleTypes.vegetation")}</option>
                <option value="TOWER">{t("coordinator.detail.obstacleTypes.tower")}</option>
                <option value="OTHER">{t("coordinator.detail.obstacleTypes.other")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                id="feat-height"
                label={t("coordinator.detail.obstacleHeight")}
                type="number"
                value={val("height")}
                onChange={(e) => handleChange("height", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
              <Input
                id="feat-buffer-distance"
                label={t("coordinator.detail.bufferDistance")}
                type="number"
                value={val("buffer_distance")}
                onChange={(e) => handleChange("buffer_distance", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            </div>
            {airportId && (
              <RecalculateBlock
                loading={recalcLoading}
                error={recalcError}
                preview={recalcPreview}
                onRecalculate={handleRecalculate}
                onApply={handleApplyRecalculate}
                onCancel={() => setRecalcPreview(null)}
              />
            )}
          </>
        )}

        {feature.type === "safety_zone" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.zoneName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.zoneType")}
              </label>
              <select
                value={val("type")}
                onChange={(e) => handleChange("type", e.target.value)}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="CTR">{t("coordinator.detail.zoneTypes.ctr")}</option>
                <option value="RESTRICTED">{t("coordinator.detail.zoneTypes.restricted")}</option>
                <option value="PROHIBITED">{t("coordinator.detail.zoneTypes.prohibited")}</option>
                <option value="TEMPORARY_NO_FLY">{t("coordinator.detail.zoneTypes.temporaryNoFly")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                id="feat-floor"
                label={t("coordinator.detail.zoneFloor")}
                type="number"
                value={val("altitude_floor")}
                onChange={(e) => handleChange("altitude_floor", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
              <Input
                id="feat-ceiling"
                label={t("coordinator.detail.zoneCeiling")}
                type="number"
                value={val("altitude_ceiling")}
                onChange={(e) => handleChange("altitude_ceiling", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-tv-text-primary">
              <input
                type="checkbox"
                checked={Boolean(formData.is_active)}
                onChange={(e) => handleChange("is_active", e.target.checked)}
                className="accent-tv-accent"
              />
              {t("coordinator.detail.zoneActive")}
            </label>
          </>
        )}

        {feature.type === "agl" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.aglName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            {surfaces && surfaces.length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                  {t("coordinator.detail.aglSurface")}
                </label>
                <select
                  value={val("surface_id")}
                  onChange={(e) => handleChange("surface_id", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                >
                  <option value="">-</option>
                  {surfaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.surface_type === "RUNWAY" ? "RWY" : "TWY"} {s.identifier}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Input
              id="feat-type"
              label={t("coordinator.detail.aglType")}
              value={val("agl_type")}
              onChange={(e) => handleChange("agl_type", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.aglSide")}
              </label>
              <select
                value={val("side")}
                onChange={(e) => handleChange("side", e.target.value)}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="">—</option>
                <option value="LEFT">{t("coordinator.detail.aglSides.left")}</option>
                <option value="RIGHT">{t("coordinator.detail.aglSides.right")}</option>
              </select>
            </div>
            <Input
              id="feat-glide"
              label={t("coordinator.detail.aglGlideAngle")}
              type="number"
              step="0.1"
              value={val("glide_slope_angle")}
              onChange={(e) => handleChange("glide_slope_angle", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
            <PointCoordEditor
              position={(formData.position as PointZ | undefined) ?? null}
              onChange={(coords) => {
                const newPos = { type: "Point" as const, coordinates: coords };
                setFormData((prev) => ({ ...prev, position: newPos }));
                onUpdate({ position: newPos, preserve_altitude: true });
              }}
            />
            {onAddLha && (
              <button
                onClick={() => onAddLha(String(formData.id))}
                className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-tv-accent text-tv-accent hover:bg-tv-surface-hover transition-colors"
                data-testid="add-lha-button"
              >
                <Plus className="h-3 w-3" />
                {t("coordinator.detail.addLha")}
              </button>
            )}
          </>
        )}

        {feature.type === "lha" && (
          <>
            <Input
              id="feat-unit"
              label={t("coordinator.detail.lhaUnitNumber")}
              type="number"
              value={val("unit_number")}
              onChange={(e) => handleChange("unit_number", e.target.value === "" ? null : parseInt(e.target.value))}
            />
            <Input
              id="feat-angle"
              label={t("coordinator.detail.lhaSettingAngle")}
              type="number"
              step="0.1"
              value={val("setting_angle")}
              onChange={(e) => handleChange("setting_angle", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.lhaLampType")}
              </label>
              <select
                value={val("lamp_type")}
                onChange={(e) => handleChange("lamp_type", e.target.value)}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="HALOGEN">{t("coordinator.detail.lampTypes.halogen")}</option>
                <option value="LED">{t("coordinator.detail.lampTypes.led")}</option>
              </select>
            </div>
            <PointCoordEditor
              position={(formData.position as PointZ | undefined) ?? null}
              onChange={(coords) => {
                const newPos = { type: "Point" as const, coordinates: coords };
                setFormData((prev) => ({ ...prev, position: newPos }));
                onUpdate({ position: newPos, preserve_altitude: true });
              }}
            />
          </>
        )}

        {/* delete button */}
        {onDelete && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-tv-error hover:opacity-90 transition-colors"
            data-testid="feature-delete-button"
          >
            <Trash2 className="h-3 w-3" />
            {t("coordinator.detail.deleteFeature")}
          </button>
        )}
      </div>
      </FeatureInfoPanel>

      {onDelete && (
        <ConfirmDeleteDialog
          isOpen={showDeleteConfirm}
          name={val("name") || val("identifier") || val("unit_number") || ""}
          warnings={deleteWarnings}
          error={deleteError}
          onConfirm={async () => {
            setDeleteError(null);
            try {
              await onDelete(feature.type, String(formData.id));
              setShowDeleteConfirm(false);
              onClose();
            } catch (err) {
              setDeleteError(
                err instanceof Error && err.message
                  ? err.message
                  : t("coordinator.detail.deleteError"),
              );
            }
          }}
          onCancel={() => {
            setDeleteError(null);
            setShowDeleteConfirm(false);
          }}
        />
      )}
    </div>
  );
}

function PointCoordEditor({
  position,
  onChange,
}: {
  position: PointZ | null;
  onChange: (coords: [number, number, number]) => void;
}) {
  /** inline lat/lon/alt editor for a point geometry. */
  const { t } = useTranslation();
  if (!position || position.coordinates.length < 3) return null;
  const [lon, lat, alt] = position.coordinates;

  function commit(field: "lat" | "lon" | "alt", value: string) {
    /** parse + validate, then push update via onChange. */
    const v = parseFloat(value);
    if (isNaN(v)) return;
    if (field === "lat" && (v < -90 || v > 90)) return;
    if (field === "lon" && (v < -180 || v > 180)) return;
    if (field === "alt" && v < 0) return;
    const newLat = field === "lat" ? v : lat;
    const newLon = field === "lon" ? v : lon;
    const newAlt = field === "alt" ? v : alt;
    onChange([newLon, newLat, newAlt]);
  }

  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="point-coord-editor">
      <Input
        id="feat-lat"
        label={t("map.coordinates.lat")}
        type="number"
        step="0.000001"
        value={String(lat)}
        onChange={(e) => commit("lat", e.target.value)}
      />
      <Input
        id="feat-lon"
        label={t("map.coordinates.lon")}
        type="number"
        step="0.000001"
        value={String(lon)}
        onChange={(e) => commit("lon", e.target.value)}
      />
      <Input
        id="feat-alt"
        label={t("map.coordinates.alt")}
        type="number"
        step="0.01"
        value={String(alt)}
        onChange={(e) => commit("alt", e.target.value)}
      />
    </div>
  );
}

function fmtDim(v: number | null | undefined, unit: string) {
  /** format a dimension number with unit, dash if missing. */
  if (v == null) return "—";
  return `${v.toFixed(2)}${unit}`;
}

function RecalculateBlock({
  loading,
  error,
  preview,
  onRecalculate,
  onApply,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  preview: RecalcPreview | null;
  onRecalculate: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  /** recalculate dimensions button + side-by-side preview. */
  const { t } = useTranslation();

  if (preview) {
    const { current, recalculated } = preview.data;
    const m = t("common.units.m");
    return (
      <div
        className="mt-2 rounded-lg border border-tv-border bg-tv-bg p-2 space-y-1.5"
        data-testid="recalculate-preview"
      >
        <div className="grid grid-cols-3 gap-1 text-[10px] text-tv-text-muted">
          <span></span>
          <span className="text-right">{t("coordinator.detail.currentValues")}</span>
          <span className="text-right">{t("coordinator.detail.recalculatedValues")}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-xs">
          <span className="text-tv-text-muted">{t("coordinator.detail.surfaceLength")}</span>
          <span className="text-right text-tv-text-secondary">{fmtDim(current.length, m)}</span>
          <span className="text-right text-tv-text-primary font-medium">
            {fmtDim(recalculated.length, m)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-xs">
          <span className="text-tv-text-muted">{t("coordinator.detail.surfaceWidth")}</span>
          <span className="text-right text-tv-text-secondary">{fmtDim(current.width, m)}</span>
          <span className="text-right text-tv-text-primary font-medium">
            {fmtDim(recalculated.width, m)}
          </span>
        </div>
        {preview.kind === "surface" && (
          <div className="grid grid-cols-3 gap-1 text-xs">
            <span className="text-tv-text-muted">{t("coordinator.detail.surfaceHeading")}</span>
            <span className="text-right text-tv-text-secondary">
              {fmtDim(preview.data.current.heading, "°")}
            </span>
            <span className="text-right text-tv-text-primary font-medium">
              {fmtDim(preview.data.recalculated.heading, "°")}
            </span>
          </div>
        )}
        <div className="flex gap-1.5 pt-1">
          {preview.kind === "surface" ? (
            <>
              <button
                onClick={onApply}
                className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-accent text-tv-accent hover:bg-tv-surface-hover transition-colors"
                data-testid="recalculate-apply"
              >
                {t("coordinator.detail.applyRecalculated")}
              </button>
              <button
                onClick={onCancel}
                className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                data-testid="recalculate-cancel"
              >
                {t("coordinator.detail.cancelRecalculated")}
              </button>
            </>
          ) : (
            // obstacle preview is informational only - no writable dimension columns
            <button
              onClick={onCancel}
              className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="recalculate-close"
            >
              {t("common.close")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={onRecalculate}
        disabled={loading}
        title={t("coordinator.detail.recalculateDescription")}
        className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors disabled:opacity-50"
        data-testid="recalculate-button"
      >
        <Calculator className="h-3 w-3" />
        {t("coordinator.detail.recalculate")}
      </button>
      {error && <p className="text-[10px] text-tv-error pl-1">{error}</p>}
    </div>
  );
}
