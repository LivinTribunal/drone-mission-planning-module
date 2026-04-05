import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, RotateCcw } from "lucide-react";
import Input from "@/components/common/Input";
import type { SurfaceResponse, AGLResponse } from "@/types/airport";

export type PendingGeometryType = "polygon" | "circle" | "point";

type CategoryPolygon = "surface" | "safety_zone" | "obstacle";
type CategoryPoint = "agl" | "lha";
type Category = CategoryPolygon | CategoryPoint;

type EntityType =
  | "runway"
  | "taxiway"
  | "safety_zone_ctr"
  | "safety_zone_restricted"
  | "safety_zone_prohibited"
  | "safety_zone_no_fly"
  | "obstacle"
  | "agl"
  | "lha";

interface CreationFormProps {
  geometryType: PendingGeometryType;
  circleRadius?: number;
  circleCenter?: [number, number];
  pointPosition?: [number, number];
  surfaces: SurfaceResponse[];
  onCancel: () => void;
  onCreate: (entityType: EntityType, data: Record<string, unknown>) => Promise<void>;
  prefilledWidth?: number;
  prefilledLength?: number;
  prefilledHeading?: number;
  prefilledArea?: number;
}

const POLYGON_CATEGORIES: { value: CategoryPolygon; labelKey: string }[] = [
  { value: "surface", labelKey: "coordinator.creation.categorySurface" },
  { value: "safety_zone", labelKey: "coordinator.creation.categorySafetyZone" },
  { value: "obstacle", labelKey: "coordinator.creation.categoryObstacle" },
];

const CIRCLE_CATEGORIES: { value: CategoryPolygon; labelKey: string }[] = [
  { value: "safety_zone", labelKey: "coordinator.creation.categorySafetyZone" },
  { value: "obstacle", labelKey: "coordinator.creation.categoryObstacle" },
];

const POINT_CATEGORIES: { value: CategoryPoint; labelKey: string }[] = [
  { value: "agl", labelKey: "coordinator.creation.categoryAgl" },
  { value: "lha", labelKey: "coordinator.creation.categoryLha" },
];

const SURFACE_SUBTYPES: { value: EntityType; labelKey: string }[] = [
  { value: "runway", labelKey: "coordinator.creation.typeRunway" },
  { value: "taxiway", labelKey: "coordinator.creation.typeTaxiway" },
];

const SAFETY_ZONE_SUBTYPES: { value: EntityType; labelKey: string }[] = [
  { value: "safety_zone_ctr", labelKey: "coordinator.creation.typeSafetyZoneCtr" },
  { value: "safety_zone_restricted", labelKey: "coordinator.creation.typeSafetyZoneRestricted" },
  { value: "safety_zone_prohibited", labelKey: "coordinator.creation.typeSafetyZoneProhibited" },
  { value: "safety_zone_no_fly", labelKey: "coordinator.creation.typeSafetyZoneNoFly" },
];

const OBSTACLE_SUBTYPES: { value: string; labelKey: string }[] = [
  { value: "BUILDING", labelKey: "coordinator.detail.obstacleTypes.building" },
  { value: "ANTENNA", labelKey: "coordinator.detail.obstacleTypes.antenna" },
  { value: "VEGETATION", labelKey: "coordinator.detail.obstacleTypes.vegetation" },
  { value: "TOWER", labelKey: "coordinator.detail.obstacleTypes.tower" },
  { value: "OTHER", labelKey: "coordinator.detail.obstacleTypes.other" },
];

export default function CreationForm({
  geometryType,
  circleRadius,
  circleCenter,
  pointPosition,
  surfaces,
  onCancel,
  onCreate,
  prefilledWidth,
  prefilledLength,
  prefilledHeading,
  prefilledArea,
}: CreationFormProps) {
  /** creation form shown after drawing a geometry - two-tier type selection, fill fields, create entity. */
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category | "">("");
  const [entityType, setEntityType] = useState<EntityType | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form field state
  const [name, setName] = useState("");
  const [heading, setHeading] = useState(prefilledHeading != null ? String(Math.round(prefilledHeading * 10) / 10) : "");
  const [length, setLength] = useState(prefilledLength != null ? String(Math.round(prefilledLength * 100) / 100) : "");
  const [width, setWidth] = useState(prefilledWidth != null ? String(Math.round(prefilledWidth * 100) / 100) : "");
  const [altFloor, setAltFloor] = useState("0");
  const [altCeiling, setAltCeiling] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [obstacleType, setObstacleType] = useState("BUILDING");
  const [obstacleHeight, setObstacleHeight] = useState("");
  const [bufferRadius, setBufferRadius] = useState(circleRadius != null ? String(Math.round(circleRadius)) : "0");
  const [aglType] = useState("PAPI");
  const [aglSide, setAglSide] = useState("LEFT");
  const [glideSlopeAngle, setGlideSlopeAngle] = useState("3.0");
  const [distFromThreshold, setDistFromThreshold] = useState("");
  const [surfaceId, setSurfaceId] = useState(surfaces.length > 0 ? surfaces[0].id : "");

  // lha fields
  const [lhaAglId, setLhaAglId] = useState("");
  const [lhaSettingAngle, setLhaSettingAngle] = useState("3.0");
  const [lhaLampType, setLhaLampType] = useState("HALOGEN");

  // collect all agls from surfaces
  const allAgls = useMemo(() => {
    const agls: (AGLResponse & { surfaceId: string })[] = [];
    for (const s of surfaces) {
      for (const a of s.agls) {
        agls.push({ ...a, surfaceId: s.id });
      }
    }
    return agls;
  }, [surfaces]);

  // auto-increment lha unit number based on selected agl
  const nextUnitNumber = useMemo(() => {
    if (!lhaAglId) return 1;
    const agl = allAgls.find((a) => a.id === lhaAglId);
    if (!agl) return 1;
    return agl.lhas.length + 1;
  }, [lhaAglId, allAgls]);

  const categoryOptions = geometryType === "circle"
    ? CIRCLE_CATEGORIES
    : geometryType === "point"
      ? POINT_CATEGORIES
      : POLYGON_CATEGORIES;

  function handleCategoryChange(val: string) {
    /** update category and reset entity type. */
    setCategory(val as Category);
    setEntityType("");
  }

  // determine effective entity type - some categories map directly
  const effectiveEntityType: EntityType | "" = (() => {
    if (category === "obstacle") return "obstacle";
    if (category === "agl") return "agl";
    if (category === "lha") return "lha";
    return entityType;
  })();

  // whether a subtype dropdown is needed
  const needsSubtype = category === "surface" || category === "safety_zone";

  async function handleSubmit() {
    /** validate and submit the creation form. */
    if (!effectiveEntityType || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data: Record<string, unknown> = { name: name.trim() };

      if (effectiveEntityType === "runway" || effectiveEntityType === "taxiway") {
        if (heading) data.heading = parseFloat(heading);
        if (length) data.length = parseFloat(length);
        if (width) data.width = parseFloat(width);
      }

      if (effectiveEntityType.startsWith("safety_zone_")) {
        data.altitude_floor = altFloor ? parseFloat(altFloor) : 0;
        if (altCeiling) data.altitude_ceiling = parseFloat(altCeiling);
        data.is_active = isActive;
      }

      if (effectiveEntityType === "obstacle") {
        data.type = obstacleType;
        if (obstacleHeight) data.height = parseFloat(obstacleHeight);
        data.radius = bufferRadius ? parseFloat(bufferRadius) : 0;
        if (circleCenter) data.center = circleCenter;
        else if (pointPosition) data.center = pointPosition;
      }

      if (effectiveEntityType === "agl") {
        data.agl_type = aglType;
        data.side = aglSide;
        if (glideSlopeAngle) data.glide_slope_angle = parseFloat(glideSlopeAngle);
        if (distFromThreshold) data.distance_from_threshold = parseFloat(distFromThreshold);
        data.surface_id = surfaceId;
        if (pointPosition) data.center = pointPosition;
      }

      if (effectiveEntityType === "lha") {
        data.agl_id = lhaAglId;
        data.unit_number = nextUnitNumber;
        data.setting_angle = lhaSettingAngle ? parseFloat(lhaSettingAngle) : 3.0;
        data.lamp_type = lhaLampType;
        if (pointPosition) data.center = pointPosition;
      }

      await onCreate(effectiveEntityType, data);
    } catch {
      setError(t("coordinator.creation.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  const isSafetyZone = effectiveEntityType.startsWith("safety_zone_");

  function namePlaceholder(): string {
    /** get the right placeholder for the name field. */
    if (effectiveEntityType === "runway") return t("coordinator.creation.namePlaceholderRunway");
    if (effectiveEntityType === "taxiway") return t("coordinator.creation.namePlaceholderTaxiway");
    if (isSafetyZone) return t("coordinator.creation.namePlaceholderZone");
    if (effectiveEntityType === "obstacle") return t("coordinator.creation.namePlaceholderObstacle");
    if (effectiveEntityType === "agl") return t("coordinator.creation.namePlaceholderAgl");
    if (effectiveEntityType === "lha") return t("coordinator.creation.namePlaceholderLha");
    return "";
  }

  const safetyZoneTypeLabel = isSafetyZone
    ? effectiveEntityType.replace("safety_zone_", "").toUpperCase().replace("NO_FLY", "TEMPORARY_NO_FLY")
    : "";

  const canSubmit = effectiveEntityType && name.trim()
    && (effectiveEntityType !== "lha" || lhaAglId)
    && (effectiveEntityType !== "agl" || surfaceId);

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg p-3"
      data-testid="creation-form"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("coordinator.creation.title")}
        </span>
        <button
          onClick={onCancel}
          className="rounded-full p-1 text-tv-text-muted hover:text-tv-text-primary transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 [&_input]:!px-3 [&_input]:!py-1.5 [&_input]:!text-xs">
        {/* tier 1 - category selection */}
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("coordinator.creation.selectCategory")}
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="creation-category-select"
          >
            <option value="">{t("coordinator.creation.selectCategory")}</option>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* tier 2 - subtype selection (for surface and safety_zone) */}
        {needsSubtype && category && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("coordinator.creation.selectType")}
            </label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType | "")}
              className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="creation-type-select"
            >
              <option value="">{t("coordinator.creation.selectType")}</option>
              {(category === "surface" ? SURFACE_SUBTYPES : SAFETY_ZONE_SUBTYPES).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* obstacle subtype - shown inline since category directly maps to entity */}
        {category === "obstacle" && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("coordinator.creation.obstacleType")}
            </label>
            <select
              value={obstacleType}
              onChange={(e) => setObstacleType(e.target.value)}
              className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            >
              {OBSTACLE_SUBTYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        )}

        {effectiveEntityType && (
          <>
            {/* name - always required */}
            <Input
              id="create-name"
              label={t("coordinator.detail.obstacleName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder()}
            />

            {/* runway / taxiway fields */}
            {(effectiveEntityType === "runway" || effectiveEntityType === "taxiway") && (
              <>
                <Input
                  id="create-heading"
                  label={t("coordinator.creation.heading")}
                  type="number"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                />
                {heading && (
                  <div className="flex items-center gap-2">
                    <svg className="h-6 w-6 flex-shrink-0" viewBox="0 0 24 24">
                      <line
                        x1="12" y1="20" x2="12" y2="4"
                        stroke="var(--tv-accent)" strokeWidth="2" strokeLinecap="round"
                        transform={`rotate(${parseFloat(heading)}, 12, 12)`}
                      />
                      <polygon
                        points="12,2 9,8 15,8"
                        fill="var(--tv-accent)"
                        transform={`rotate(${parseFloat(heading)}, 12, 12)`}
                      />
                    </svg>
                    <span className="text-[10px] text-tv-text-muted">
                      {Math.round(parseFloat(heading) * 10) / 10}°
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseFloat(heading);
                        if (!isNaN(current)) setHeading(String((current + 180) % 360));
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
                    id="create-length"
                    label={t("coordinator.creation.length")}
                    type="number"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                  />
                  <Input
                    id="create-width"
                    label={t("coordinator.creation.width")}
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* safety zone fields */}
            {isSafetyZone && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-tv-text-secondary">{t("coordinator.detail.zoneType")}:</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium border"
                    style={{
                      borderColor: "var(--tv-accent)",
                      color: "var(--tv-accent)",
                    }}
                  >
                    {safetyZoneTypeLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    id="create-alt-floor"
                    label={t("coordinator.creation.altitudeFloor")}
                    type="number"
                    value={altFloor}
                    onChange={(e) => setAltFloor(e.target.value)}
                  />
                  <Input
                    id="create-alt-ceiling"
                    label={t("coordinator.creation.altitudeCeiling")}
                    type="number"
                    value={altCeiling}
                    onChange={(e) => setAltCeiling(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-tv-text-primary">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="accent-tv-accent"
                  />
                  {t("coordinator.creation.active")}
                </label>
                {prefilledArea != null && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.area")}: {Math.round(prefilledArea)} m²
                  </p>
                )}
              </>
            )}

            {/* obstacle fields */}
            {effectiveEntityType === "obstacle" && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    id="create-height"
                    label={t("coordinator.creation.obstacleHeight")}
                    type="number"
                    value={obstacleHeight}
                    onChange={(e) => setObstacleHeight(e.target.value)}
                  />
                  <Input
                    id="create-radius"
                    label={t("coordinator.creation.bufferRadius")}
                    type="number"
                    value={bufferRadius}
                    onChange={(e) => setBufferRadius(e.target.value)}
                  />
                </div>
                {(circleCenter || pointPosition) && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.position")}:{" "}
                    {(circleCenter ?? pointPosition)![1].toFixed(6)},{" "}
                    {(circleCenter ?? pointPosition)![0].toFixed(6)}
                  </p>
                )}
                {prefilledArea != null && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.area")}: {Math.round(prefilledArea)} m²
                  </p>
                )}
              </>
            )}

            {/* agl fields */}
            {effectiveEntityType === "agl" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("coordinator.creation.aglType")}
                  </label>
                  <select
                    disabled
                    value={aglType}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-surface text-tv-text-muted"
                  >
                    <option value="PAPI">PAPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("coordinator.creation.aglSide")}
                  </label>
                  <select
                    value={aglSide}
                    onChange={(e) => setAglSide(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                  >
                    <option value="LEFT">{t("coordinator.detail.aglSides.left")}</option>
                    <option value="RIGHT">{t("coordinator.detail.aglSides.right")}</option>
                  </select>
                </div>
                <Input
                  id="create-glide"
                  label={t("coordinator.creation.glideSlopeAngle")}
                  type="number"
                  step="0.1"
                  value={glideSlopeAngle}
                  onChange={(e) => setGlideSlopeAngle(e.target.value)}
                />
                <Input
                  id="create-dist"
                  label={t("coordinator.creation.distanceFromThreshold")}
                  type="number"
                  value={distFromThreshold}
                  onChange={(e) => setDistFromThreshold(e.target.value)}
                />
                {surfaces.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                      {t("coordinator.creation.surface")}
                    </label>
                    <select
                      value={surfaceId}
                      onChange={(e) => setSurfaceId(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                    >
                      <option value="">{t("coordinator.creation.selectSurface")}</option>
                      {surfaces.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.surface_type === "RUNWAY" ? "RWY" : "TWY"} {s.identifier}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {pointPosition && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.position")}:{" "}
                    {pointPosition[1].toFixed(6)}, {pointPosition[0].toFixed(6)}
                  </p>
                )}
              </>
            )}

            {/* lha fields */}
            {effectiveEntityType === "lha" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("coordinator.creation.parentAgl")}
                  </label>
                  <select
                    value={lhaAglId}
                    onChange={(e) => setLhaAglId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                  >
                    <option value="">{t("coordinator.creation.selectAgl")}</option>
                    {allAgls.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {lhaAglId && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.unitNumber")}: {nextUnitNumber}
                  </p>
                )}
                <Input
                  id="create-lha-angle"
                  label={t("coordinator.detail.lhaSettingAngle")}
                  type="number"
                  step="0.1"
                  value={lhaSettingAngle}
                  onChange={(e) => setLhaSettingAngle(e.target.value)}
                />
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("coordinator.detail.lhaLampType")}
                  </label>
                  <select
                    value={lhaLampType}
                    onChange={(e) => setLhaLampType(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                  >
                    <option value="HALOGEN">{t("coordinator.detail.lampTypes.halogen")}</option>
                    <option value="LED">{t("coordinator.detail.lampTypes.led")}</option>
                  </select>
                </div>
                {pointPosition && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.position")}:{" "}
                    {pointPosition[1].toFixed(6)}, {pointPosition[0].toFixed(6)}
                  </p>
                )}
              </>
            )}

            {error && (
              <p className="text-xs text-tv-error">{error}</p>
            )}

            {/* action buttons */}
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  submitting || !canSubmit
                    ? "bg-tv-surface text-tv-text-muted cursor-not-allowed"
                    : "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover"
                }`}
                data-testid="creation-submit"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {t("coordinator.tools.create")}
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
