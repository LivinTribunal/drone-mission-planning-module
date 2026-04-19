import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, RotateCcw, Plus, Calculator, MapPin, AlertTriangle } from "lucide-react";
import Input from "@/components/common/Input";
import FeatureInfoPanel from "@/components/common/FeatureInfoPanel";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import type { MapFeature } from "@/types/map";
import type {
  SurfaceResponse,
  SurfaceRecalculateResponse,
  ObstacleRecalculateResponse,
  AGLResponse,
} from "@/types/airport";
import type { LineStringZ, PointZ } from "@/types/common";
import { recalculateSurface, recalculateObstacle, bulkCreateLHAs } from "@/api/airports";
import { distanceFromCenterline } from "@/utils/centerlineDistance";

interface EditableFeatureInfoProps {
  feature: MapFeature;
  onUpdate: (data: Record<string, unknown>) => void;
  onClose: () => void;
  airportId?: string;
  surfaces?: SurfaceResponse[];
  onDelete?: (featureType: string, id: string) => Promise<void>;
  deleteWarnings?: string[];
  onAddLha?: (aglId: string) => void;
  onLhasGenerated?: () => Promise<void> | void;
  pickingTouchpoint?: boolean;
  onPickTouchpointToggle?: () => void;
  pickedTouchpointCoord?: { lat: number; lon: number; alt: number } | null;
  onPickedTouchpointConsumed?: () => void;
  pickingLha?: "first" | "last" | null;
  onPickLhaToggle?: (which: "first" | "last") => void;
  pickedLhaCoord?: { which: "first" | "last"; lat: number; lon: number; alt: number } | null;
  onPickedLhaConsumed?: () => void;
  pickingThreshold?: boolean;
  onPickThresholdToggle?: () => void;
  pickedThresholdCoord?: { lat: number; lon: number; alt: number } | null;
  onPickedThresholdConsumed?: () => void;
  pickingEnd?: boolean;
  onPickEndToggle?: () => void;
  pickedEndCoord?: { lat: number; lon: number; alt: number } | null;
  onPickedEndConsumed?: () => void;
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
  onLhasGenerated,
  pickingTouchpoint,
  onPickTouchpointToggle,
  pickedTouchpointCoord,
  onPickedTouchpointConsumed,
  pickingLha,
  onPickLhaToggle,
  pickedLhaCoord,
  onPickedLhaConsumed,
  pickingThreshold,
  onPickThresholdToggle,
  pickedThresholdCoord,
  onPickedThresholdConsumed,
  pickingEnd,
  onPickEndToggle,
  pickedEndCoord,
  onPickedEndConsumed,
}: EditableFeatureInfoProps) {
  /** editable feature info panel for selected map features. */
  const { t } = useTranslation();
  // form state is intentionally loose - it collects partial edits that get
  // pushed to onUpdate, but the source data is always one of the typed
  // response shapes from MapFeature
  const [formData, setFormData] = useState<Record<string, unknown>>(() => ({
    ...feature.data,
  }));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recalcPreview, setRecalcPreview] = useState<RecalcPreview | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({ ...feature.data });
    setRecalcPreview(null);
    setRecalcError(null);
    setDeleteError(null);
  }, [feature]);

  // apply picked touchpoint coord to formData and notify parent it's consumed
  useEffect(() => {
    if (!pickedTouchpointCoord) return;
    const update = {
      touchpoint_latitude: pickedTouchpointCoord.lat,
      touchpoint_longitude: pickedTouchpointCoord.lon,
      touchpoint_altitude: pickedTouchpointCoord.alt,
    };
    setFormData((prev) => ({ ...prev, ...update }));
    onUpdate(update);
    onPickedTouchpointConsumed?.();
  }, [pickedTouchpointCoord, onUpdate, onPickedTouchpointConsumed]);

  // apply picked threshold coord
  useEffect(() => {
    if (!pickedThresholdCoord) return;
    const pos: PointZ = {
      type: "Point",
      coordinates: [pickedThresholdCoord.lon, pickedThresholdCoord.lat, pickedThresholdCoord.alt],
    };
    setFormData((prev) => ({ ...prev, threshold_position: pos }));
    onUpdate({ threshold_position: pos });
    onPickedThresholdConsumed?.();
  }, [pickedThresholdCoord, onUpdate, onPickedThresholdConsumed]);

  // apply picked end position coord
  useEffect(() => {
    if (!pickedEndCoord) return;
    const pos: PointZ = {
      type: "Point",
      coordinates: [pickedEndCoord.lon, pickedEndCoord.lat, pickedEndCoord.alt],
    };
    setFormData((prev) => ({ ...prev, end_position: pos }));
    onUpdate({ end_position: pos });
    onPickedEndConsumed?.();
  }, [pickedEndCoord, onUpdate, onPickedEndConsumed]);

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
    } catch (err) {
      console.error("recalculate failed", err);
      setRecalcError(
        err instanceof Error && err.message
          ? err.message
          : t("coordinator.detail.recalculateError"),
      );
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
                <span className="text-[10px] text-tv-text-muted">
                  {Math.round((parseFloat(val("heading")) + 180) % 360)}°
                </span>
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
            <Input
              id="feat-surface-buffer"
              label={t("coordinator.detail.bufferDistance")}
              type="number"
              value={val("buffer_distance")}
              onChange={(e) => handleChange("buffer_distance", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
            {val("surface_type") === "RUNWAY" && (
              <div
                className="mt-1 rounded-lg border border-tv-border bg-tv-bg p-2 space-y-1.5"
                data-testid="surface-touchpoint-section"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold text-tv-text-secondary uppercase tracking-wide">
                    {t("coordinator.detail.touchpoint")}
                  </p>
                  {onPickTouchpointToggle && (
                    <button
                      type="button"
                      onClick={onPickTouchpointToggle}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                        pickingTouchpoint
                          ? "border-tv-accent bg-tv-accent text-tv-accent-text"
                          : "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
                      }`}
                      data-testid="surface-touchpoint-pick-map"
                    >
                      <MapPin className="h-3 w-3" />
                      {t("mission.config.pickOnMap")}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    id="feat-tp-lat"
                    label={t("map.coordinates.lat")}
                    type="number"
                    step="0.000001"
                    value={val("touchpoint_latitude")}
                    onChange={(e) => handleChange(
                      "touchpoint_latitude",
                      e.target.value === "" ? null : parseFloat(e.target.value),
                    )}
                  />
                  <Input
                    id="feat-tp-lon"
                    label={t("map.coordinates.lon")}
                    type="number"
                    step="0.000001"
                    value={val("touchpoint_longitude")}
                    onChange={(e) => handleChange(
                      "touchpoint_longitude",
                      e.target.value === "" ? null : parseFloat(e.target.value),
                    )}
                  />
                </div>
                <Input
                  id="feat-tp-alt"
                  label={t("map.coordinates.alt")}
                  type="number"
                  step="0.01"
                  value={val("touchpoint_altitude")}
                  onChange={(e) => handleChange(
                    "touchpoint_altitude",
                    e.target.value === "" ? null : parseFloat(e.target.value),
                  )}
                />
              </div>
            )}
            {val("surface_type") === "RUNWAY" && (
              <ThresholdEndSection
                formData={formData}
                setFormData={setFormData}
                onUpdate={onUpdate}
                centerline={(formData.geometry as LineStringZ | undefined)?.coordinates}
                pickingThreshold={pickingThreshold}
                onPickThresholdToggle={onPickThresholdToggle}
                pickingEnd={pickingEnd}
                onPickEndToggle={onPickEndToggle}
              />
            )}
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
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.aglType")}
              </label>
              <select
                value={val("agl_type")}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "RUNWAY_EDGE_LIGHTS" && formData.glide_slope_angle != null) {
                    setFormData((prev) => ({ ...prev, agl_type: next, glide_slope_angle: null }));
                    onUpdate({ agl_type: next, glide_slope_angle: null });
                  } else {
                    handleChange("agl_type", next);
                  }
                }}
                className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                data-testid="feat-agl-type-select"
              >
                <option value="PAPI">PAPI</option>
                <option value="RUNWAY_EDGE_LIGHTS">{t("coordinator.agl.runwayEdgeLights")}</option>
              </select>
            </div>
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
            {val("agl_type") === "PAPI" && (
              <Input
                id="feat-glide"
                label={t("coordinator.detail.aglGlideAngle")}
                type="number"
                step="0.1"
                value={val("glide_slope_angle")}
                onChange={(e) => handleChange("glide_slope_angle", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            )}
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
            {airportId && (
              <QuickLhaSetup
                airportId={airportId}
                agl={feature.data as AGLResponse}
                surfaces={surfaces ?? []}
                onGenerated={onLhasGenerated}
                pickingLha={pickingLha ?? null}
                onPickLhaToggle={onPickLhaToggle}
                pickedLhaCoord={pickedLhaCoord ?? null}
                onPickedLhaConsumed={onPickedLhaConsumed}
              />
            )}
          </>
        )}

        {feature.type === "lha" && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.lhaUnitDesignator")}
              </label>
              {(() => {
                const parentAgl = surfaces?.flatMap(s => s.agls).find(a => a.id === formData.agl_id);
                const isPapi = parentAgl?.agl_type === "PAPI";
                const siblingDesignators = new Set(
                  parentAgl?.lhas
                    ?.filter(l => l.id !== formData.id)
                    .map(l => l.unit_designator) ?? []
                );
                const availableDesignators = ["A", "B", "C", "D"].filter(
                  d => !siblingDesignators.has(d) || d === val("unit_designator")
                );
                return isPapi ? (
                  <select
                    value={val("unit_designator")}
                    onChange={(e) => handleChange("unit_designator", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                  >
                    {availableDesignators.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="feat-unit-designator"
                    label=""
                    value={val("unit_designator")}
                    onChange={(e) => handleChange("unit_designator", e.target.value)}
                  />
                );
              })()}
            </div>
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
            <Input
              id="feat-tolerance"
              label={t("coordinator.detail.lhaTolerance")}
              type="number"
              step="0.1"
              value={val("tolerance")}
              onChange={(e) => handleChange("tolerance", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
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
          name={val("name") || val("identifier") || val("unit_designator") || ""}
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
    // altitude is MSL, can be negative for sub-sea-level airports
    const newLat = field === "lat" ? v : lat;
    const newLon = field === "lon" ? v : lon;
    const newAlt = field === "alt" ? v : alt;
    onChange([newLon, newLat, newAlt]);
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="point-coord-editor">
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

function PositionBlock({
  id,
  label,
  position,
  picking,
  onPickToggle,
  onChange,
  centerlineWarningDist,
}: {
  id: string;
  label: string;
  position: PointZ | null;
  picking?: boolean;
  onPickToggle?: () => void;
  onChange: (pos: PointZ) => void;
  centerlineWarningDist: number | null;
}) {
  /** coordinate editor for a single threshold or end position. */
  const { t } = useTranslation();
  const coords = position?.coordinates;
  const lon = coords?.[0] ?? "";
  const lat = coords?.[1] ?? "";
  const alt = coords?.[2] ?? "";

  function commit(field: "lat" | "lon" | "alt", value: string) {
    /** parse and push coordinate update. */
    if (value === "") return;
    const v = parseFloat(value);
    if (isNaN(v)) return;
    if (field === "lat" && (v < -90 || v > 90)) return;
    if (field === "lon" && (v < -180 || v > 180)) return;
    const curLon = coords?.[0] ?? 0;
    const curLat = coords?.[1] ?? 0;
    const curAlt = coords?.[2] ?? 0;
    const newCoords: [number, number, number] = [
      field === "lon" ? v : curLon,
      field === "lat" ? v : curLat,
      field === "alt" ? v : curAlt,
    ];
    onChange({ type: "Point", coordinates: newCoords });
  }

  return (
    <div
      className="mt-1 rounded-lg border border-tv-border bg-tv-bg p-2 space-y-1.5"
      data-testid={`surface-${id}-section`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-tv-text-secondary uppercase tracking-wide">
          {label}
        </p>
        {onPickToggle && (
          <button
            type="button"
            onClick={onPickToggle}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
              picking
                ? "border-tv-accent bg-tv-accent text-tv-accent-text"
                : "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
            }`}
            data-testid={`surface-${id}-pick-map`}
          >
            <MapPin className="h-3 w-3" />
            {t("mission.config.pickOnMap")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          id={`feat-${id}-lat`}
          label={t("map.coordinates.lat")}
          type="number"
          step="0.000001"
          value={String(lat)}
          onChange={(e) => commit("lat", e.target.value)}
        />
        <Input
          id={`feat-${id}-lon`}
          label={t("map.coordinates.lon")}
          type="number"
          step="0.000001"
          value={String(lon)}
          onChange={(e) => commit("lon", e.target.value)}
        />
      </div>
      <Input
        id={`feat-${id}-alt`}
        label={t("map.coordinates.alt")}
        type="number"
        step="0.01"
        value={String(alt)}
        onChange={(e) => commit("alt", e.target.value)}
      />
      {centerlineWarningDist != null && centerlineWarningDist > 50 && (
        <div className="flex items-center gap-1 text-[10px] text-tv-warning">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span>{t("coordinator.detail.centerlineWarning", { distance: Math.round(centerlineWarningDist) })}</span>
        </div>
      )}
    </div>
  );
}

function ThresholdEndSection({
  formData,
  setFormData,
  onUpdate,
  centerline,
  pickingThreshold,
  onPickThresholdToggle,
  pickingEnd,
  onPickEndToggle,
}: {
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onUpdate: (data: Record<string, unknown>) => void;
  centerline?: number[][];
  pickingThreshold?: boolean;
  onPickThresholdToggle?: () => void;
  pickingEnd?: boolean;
  onPickEndToggle?: () => void;
}) {
  /** threshold and end position editors for a runway surface. */
  const { t } = useTranslation();
  const thrPos = formData.threshold_position as PointZ | null | undefined;
  const endPos = formData.end_position as PointZ | null | undefined;

  const thrDist = useMemo(() => {
    if (!thrPos?.coordinates || !centerline || centerline.length < 2) return null;
    return distanceFromCenterline(
      [thrPos.coordinates[0], thrPos.coordinates[1]],
      centerline,
    );
  }, [thrPos, centerline]);

  const endDist = useMemo(() => {
    if (!endPos?.coordinates || !centerline || centerline.length < 2) return null;
    return distanceFromCenterline(
      [endPos.coordinates[0], endPos.coordinates[1]],
      centerline,
    );
  }, [endPos, centerline]);

  return (
    <>
      <PositionBlock
        id="threshold"
        label={t("coordinator.detail.thresholdPosition")}
        position={thrPos ?? null}
        picking={pickingThreshold}
        onPickToggle={onPickThresholdToggle}
        centerlineWarningDist={thrDist}
        onChange={(pos) => {
          setFormData((prev) => ({ ...prev, threshold_position: pos }));
          onUpdate({ threshold_position: pos });
        }}
      />
      <PositionBlock
        id="end-position"
        label={t("coordinator.detail.endPosition")}
        position={endPos ?? null}
        picking={pickingEnd}
        onPickToggle={onPickEndToggle}
        centerlineWarningDist={endDist}
        onChange={(pos) => {
          setFormData((prev) => ({ ...prev, end_position: pos }));
          onUpdate({ end_position: pos });
        }}
      />
    </>
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

function QuickLhaSetup({
  airportId,
  agl,
  surfaces,
  onGenerated,
  pickingLha,
  onPickLhaToggle,
  pickedLhaCoord,
  onPickedLhaConsumed,
}: {
  airportId: string;
  agl: AGLResponse;
  surfaces: SurfaceResponse[];
  onGenerated?: () => Promise<void> | void;
  pickingLha?: "first" | "last" | null;
  onPickLhaToggle?: (which: "first" | "last") => void;
  pickedLhaCoord?: { which: "first" | "last"; lat: number; lon: number; alt: number } | null;
  onPickedLhaConsumed?: () => void;
}) {
  /** collapsible bulk LHA generator - place first/last + spacing, calls backend bulk endpoint. */
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const aglAlt = agl.position.coordinates[2] ?? 0;
  const [firstLat, setFirstLat] = useState("");
  const [firstLon, setFirstLon] = useState("");
  const [firstAlt, setFirstAlt] = useState(String(aglAlt));
  const [lastLat, setLastLat] = useState("");
  const [lastLon, setLastLon] = useState("");
  const [lastAlt, setLastAlt] = useState(String(aglAlt));
  const [spacing, setSpacing] = useState("3");
  const [lampType, setLampType] = useState<"HALOGEN" | "LED">("HALOGEN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);

  const surface = surfaces.find((s) => s.id === agl.surface_id);

  // apply incoming picked coord, then notify parent it's consumed
  useEffect(() => {
    if (!pickedLhaCoord) return;
    const lat = String(Math.round(pickedLhaCoord.lat * 1e6) / 1e6);
    const lon = String(Math.round(pickedLhaCoord.lon * 1e6) / 1e6);
    const alt = String(Math.round(pickedLhaCoord.alt * 100) / 100);
    if (pickedLhaCoord.which === "first") {
      setFirstLat(lat);
      setFirstLon(lon);
      setFirstAlt(alt);
    } else {
      setLastLat(lat);
      setLastLon(lon);
      setLastAlt(alt);
    }
    onPickedLhaConsumed?.();
  }, [pickedLhaCoord, onPickedLhaConsumed]);

  // expand panel automatically when user starts a pick
  useEffect(() => {
    if (pickingLha && !expanded) setExpanded(true);
  }, [pickingLha, expanded]);

  function pickButton(which: "first" | "last") {
    /** render a small pick-on-map button for the given target. */
    if (!onPickLhaToggle) return null;
    const active = pickingLha === which;
    return (
      <button
        type="button"
        onClick={() => onPickLhaToggle(which)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
          active
            ? "border-tv-accent bg-tv-accent text-tv-accent-text"
            : "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
        }`}
        data-testid={`qls-${which}-pick-map`}
      >
        <MapPin className="h-3 w-3" />
        {t("mission.config.pickOnMap")}
      </button>
    );
  }

  async function handleGenerate() {
    /** submit bulk generation request and surface the resulting count. */
    setErr(null);
    setGeneratedCount(null);

    const fLat = parseFloat(firstLat);
    const fLon = parseFloat(firstLon);
    const fAlt = parseFloat(firstAlt);
    const lLat = parseFloat(lastLat);
    const lLon = parseFloat(lastLon);
    const lAlt = parseFloat(lastAlt);
    const sp = parseFloat(spacing);

    if ([fLat, fLon, fAlt, lLat, lLon, lAlt].some((v) => isNaN(v))) {
      setErr(t("coordinator.agl.quickSetupInvalidPositions"));
      return;
    }
    if (isNaN(sp) || sp <= 0) {
      setErr(t("coordinator.agl.quickSetupInvalidSpacing"));
      return;
    }
    if (!surface) {
      setErr(t("coordinator.agl.quickSetupMissingSurface"));
      return;
    }

    const isEdgeLights = agl.agl_type === "RUNWAY_EDGE_LIGHTS";
    setBusy(true);
    try {
      const res = await bulkCreateLHAs(airportId, surface.id, agl.id, {
        first_position: { type: "Point", coordinates: [fLon, fLat, fAlt] },
        last_position: { type: "Point", coordinates: [lLon, lLat, lAlt] },
        spacing_m: sp,
        setting_angle: isEdgeLights ? 0 : null,
        tolerance: 0.2,
        lamp_type: lampType,
      });
      setGeneratedCount(res.generated.length);
      if (onGenerated) await onGenerated();
    } catch (e) {
      setErr(
        e instanceof Error && e.message ? e.message : t("coordinator.agl.quickSetupError"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-1 rounded-lg border border-tv-border bg-tv-bg"
      data-testid="quick-lha-setup"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold text-tv-text-secondary uppercase tracking-wide"
      >
        <span>{t("coordinator.agl.quickSetup")}</span>
        <span>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5 [&_input]:!px-3 [&_input]:!py-1.5 [&_input]:!text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-tv-text-muted">
              {t("coordinator.agl.placeFirst")}
            </p>
            {pickButton("first")}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              id="qls-first-lat"
              label={t("map.coordinates.lat")}
              type="number"
              step="0.000001"
              value={firstLat}
              onChange={(e) => setFirstLat(e.target.value)}
            />
            <Input
              id="qls-first-lon"
              label={t("map.coordinates.lon")}
              type="number"
              step="0.000001"
              value={firstLon}
              onChange={(e) => setFirstLon(e.target.value)}
            />
          </div>
          <Input
            id="qls-first-alt"
            label={t("map.coordinates.alt")}
            type="number"
            step="0.01"
            value={firstAlt}
            onChange={(e) => setFirstAlt(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-tv-text-muted">
              {t("coordinator.agl.placeLast")}
            </p>
            {pickButton("last")}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              id="qls-last-lat"
              label={t("map.coordinates.lat")}
              type="number"
              step="0.000001"
              value={lastLat}
              onChange={(e) => setLastLat(e.target.value)}
            />
            <Input
              id="qls-last-lon"
              label={t("map.coordinates.lon")}
              type="number"
              step="0.000001"
              value={lastLon}
              onChange={(e) => setLastLon(e.target.value)}
            />
          </div>
          <Input
            id="qls-last-alt"
            label={t("map.coordinates.alt")}
            type="number"
            step="0.01"
            value={lastAlt}
            onChange={(e) => setLastAlt(e.target.value)}
          />
          <Input
            id="qls-spacing"
            label={t("coordinator.agl.lhaSpacing")}
            type="number"
            step="0.1"
            value={spacing}
            onChange={(e) => setSpacing(e.target.value)}
          />
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("coordinator.detail.lhaLampType")}
            </label>
            <select
              value={lampType}
              onChange={(e) => setLampType(e.target.value as "HALOGEN" | "LED")}
              className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            >
              <option value="HALOGEN">{t("coordinator.detail.lampTypes.halogen")}</option>
              <option value="LED">{t("coordinator.detail.lampTypes.led")}</option>
            </select>
          </div>
          {err && <p className="text-[10px] text-tv-error">{err}</p>}
          {generatedCount != null && (
            <p className="text-[10px] text-tv-text-secondary" data-testid="qls-generated-count">
              {t("coordinator.agl.generatedCount", { count: generatedCount })}
            </p>
          )}
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-full text-xs font-semibold bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover transition-colors disabled:opacity-50"
            data-testid="qls-generate-button"
          >
            {t("coordinator.agl.generateLhas")}
          </button>
        </div>
      )}
    </div>
  );
}
