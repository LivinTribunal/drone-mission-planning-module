import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, RotateCcw, MapPin, AlertTriangle } from "lucide-react";
import Input from "@/components/common/Input";
import type { SurfaceResponse, AGLResponse, ObstacleResponse, SafetyZoneResponse } from "@/types/airport";
import { formatAglDisplayName } from "@/utils/agl";

export type PendingGeometryType = "polygon" | "circle" | "point";

type CategoryPolygon = "surface" | "safety_zone" | "obstacle";
type CategoryPoint = "agl" | "lha";
type Category = CategoryPolygon | CategoryPoint;

export type EntityType =
  | "runway"
  | "taxiway"
  | "safety_zone_ctr"
  | "safety_zone_restricted"
  | "safety_zone_prohibited"
  | "safety_zone_no_fly"
  | "safety_zone_airport_boundary"
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
  obstacles?: ObstacleResponse[];
  safetyZones?: SafetyZoneResponse[];
  airportElevation?: number;
  prefilledEntityType?: EntityType;
  pickingTouchpoint?: boolean;
  onPickTouchpointToggle?: () => void;
  pickedTouchpointCoord?: { lat: number; lon: number; alt: number } | null;
  onPickedTouchpointConsumed?: () => void;
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
  {
    value: "safety_zone_airport_boundary",
    labelKey: "coordinator.creation.typeSafetyZoneAirportBoundary",
  },
];

const SAFETY_ZONE_TYPE_MAP: Record<string, string> = {
  safety_zone_ctr: "CTR",
  safety_zone_restricted: "RESTRICTED",
  safety_zone_prohibited: "PROHIBITED",
  safety_zone_no_fly: "TEMPORARY_NO_FLY",
  safety_zone_airport_boundary: "AIRPORT_BOUNDARY",
};

const OBSTACLE_SUBTYPES: { value: string; labelKey: string }[] = [
  { value: "BUILDING", labelKey: "coordinator.detail.obstacleTypes.building" },
  { value: "ANTENNA", labelKey: "coordinator.detail.obstacleTypes.antenna" },
  { value: "VEGETATION", labelKey: "coordinator.detail.obstacleTypes.vegetation" },
  { value: "TOWER", labelKey: "coordinator.detail.obstacleTypes.tower" },
  { value: "OTHER", labelKey: "coordinator.detail.obstacleTypes.other" },
];

export default function CreationForm({
  geometryType,
  circleCenter,
  pointPosition,
  surfaces,
  onCancel,
  onCreate,
  prefilledWidth,
  prefilledLength,
  prefilledHeading,
  prefilledArea,
  obstacles = [],
  safetyZones = [],
  airportElevation = 0,
  prefilledEntityType,
  pickingTouchpoint = false,
  onPickTouchpointToggle,
  pickedTouchpointCoord,
  onPickedTouchpointConsumed,
}: CreationFormProps) {
  /** creation form shown after drawing a geometry - two-tier type selection, fill fields, create entity. */
  const { t } = useTranslation();
  const initialCategory: Category | "" = prefilledEntityType?.startsWith("safety_zone_")
    ? "safety_zone"
    : prefilledEntityType === "runway" || prefilledEntityType === "taxiway"
      ? "surface"
      : prefilledEntityType === "obstacle"
        ? "obstacle"
        : prefilledEntityType === "agl"
          ? "agl"
          : prefilledEntityType === "lha"
            ? "lha"
            : "";
  const [category, setCategory] = useState<Category | "">(initialCategory);
  const [entityType, setEntityType] = useState<EntityType | "">(prefilledEntityType ?? "");
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
  const [bufferDistance, setBufferDistance] = useState("5");
  const [aglType, setAglType] = useState<"PAPI" | "RUNWAY_EDGE_LIGHTS">("PAPI");
  const [aglSide, setAglSide] = useState("LEFT");
  const [glideSlopeAngle, setGlideSlopeAngle] = useState("3.0");
  const [distFromThreshold, setDistFromThreshold] = useState("");
  const [surfaceId, setSurfaceId] = useState(surfaces.length > 0 ? surfaces[0].id : "");

  // runway touchpoint fields
  const [touchpointLat, setTouchpointLat] = useState("");
  const [touchpointLon, setTouchpointLon] = useState("");
  const [touchpointAlt, setTouchpointAlt] = useState("");

  // lha fields
  const [lhaAglId, setLhaAglId] = useState("");
  const [lhaSettingAngle, setLhaSettingAngle] = useState("3.0");
  const [lhaLampType, setLhaLampType] = useState("HALOGEN");
  const [lhaTolerance, setLhaTolerance] = useState("");

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

  // next available designator based on selected agl
  const selectedAgl = useMemo(() => allAgls.find((a) => a.id === lhaAglId), [lhaAglId, allAgls]);
  const isPapiAgl = selectedAgl?.agl_type === "PAPI";
  const nextDesignator = useMemo(() => {
    if (!selectedAgl) return "A";
    if (isPapiAgl) {
      const used = new Set(selectedAgl.lhas.map((l) => l.unit_designator));
      return ["A", "B", "C", "D"].find((d) => !used.has(d)) ?? "A";
    }
    const nums = selectedAgl.lhas.map((l) => parseInt(l.unit_designator, 10)).filter((n) => !isNaN(n));
    return String(nums.length > 0 ? Math.max(...nums) + 1 : 1);
  }, [selectedAgl, isPapiAgl]);

  // manual coordinate entry for AGL/LHA - altitude is always airport elevation (set by handleCreate on page)
  const [manualLat, setManualLat] = useState(pointPosition ? String(pointPosition[1]) : "");
  const [manualLon, setManualLon] = useState(pointPosition ? String(pointPosition[0]) : "");

  // sync map clicks into manual fields
  useEffect(() => {
    if (pointPosition) {
      setManualLat(String(pointPosition[1]));
      setManualLon(String(pointPosition[0]));
    }
  }, [pointPosition]);

  // consume picked touchpoint coordinate from map click
  useEffect(() => {
    if (pickedTouchpointCoord) {
      setTouchpointLat(String(Math.round(pickedTouchpointCoord.lat * 1e6) / 1e6));
      setTouchpointLon(String(Math.round(pickedTouchpointCoord.lon * 1e6) / 1e6));
      setTouchpointAlt(String(Math.round(pickedTouchpointCoord.alt * 100) / 100));
      onPickedTouchpointConsumed?.();
    }
  }, [pickedTouchpointCoord, onPickedTouchpointConsumed]);

  // auto-prefill surface identifier based on subtype + count
  useEffect(() => {
    if (category !== "surface" || !entityType) return;
    const surfaceType = entityType === "runway" ? "RUNWAY" : "TAXIWAY";
    const count = surfaces.filter((s) => s.surface_type === surfaceType).length;
    const prefix = entityType === "runway" ? "RWY" : "TWY";
    setName(`${prefix} ${count + 1}`);
  }, [entityType, category]); // surfaces intentionally excluded - only prefill on type change

  // auto-prefill obstacle name based on type + count
  useEffect(() => {
    if (category !== "obstacle") return;
    const count = obstacles.filter((o) => o.type === obstacleType).length;
    const sub = OBSTACLE_SUBTYPES.find((s) => s.value === obstacleType);
    const label = sub ? t(sub.labelKey) : obstacleType;
    setName(`${label} ${count + 1}`);
  }, [obstacleType, category, t]); // obstacles intentionally excluded - only prefill on type change

  // auto-prefill AGL name based on connected surface and type
  useEffect(() => {
    if (category !== "agl") return;
    const surface = surfaces.find((s) => s.id === surfaceId);
    const isRunway = surface?.surface_type === "RUNWAY";
    const typeLabel = aglType === "RUNWAY_EDGE_LIGHTS" ? "REL" : "PAPI";
    if (surface) {
      const prefix = isRunway ? "RWY" : "TWY";
      setName(`${typeLabel} ${prefix} ${surface.identifier}`);
    } else {
      setName(typeLabel);
    }
  }, [surfaceId, category, surfaces, aglType]);

  // auto-prefill LHA name
  useEffect(() => {
    if (category !== "lha" || !lhaAglId) return;
    setName(`LHA Unit ${nextDesignator}`);
  }, [lhaAglId, category, nextDesignator]);

  // pre-fill lha fields from most recent lha on the selected agl.
  // position intentionally stays blank - user places each lha on the map.
  useEffect(() => {
    if (category !== "lha" || !lhaAglId) return;
    const agl = allAgls.find((a) => a.id === lhaAglId);
    if (!agl) return;
    const sorted = [...agl.lhas].sort((a, b) => {
      const an = parseInt(a.unit_designator, 10);
      const bn = parseInt(b.unit_designator, 10);
      return !isNaN(an) && !isNaN(bn) ? an - bn : a.unit_designator.localeCompare(b.unit_designator);
    });
    const recent = sorted[sorted.length - 1];
    if (recent) {
      setLhaTolerance(recent.tolerance != null ? String(recent.tolerance) : "0.2");
      setLhaLampType(recent.lamp_type);
      if (agl.agl_type === "PAPI") {
        setLhaSettingAngle("");
      } else {
        setLhaSettingAngle(recent.setting_angle != null ? String(recent.setting_angle) : "");
      }
    } else {
      setLhaTolerance("0.2");
      setLhaLampType("HALOGEN");
      setLhaSettingAngle(agl.agl_type === "PAPI" ? "" : "0.0");
    }
  }, [lhaAglId, allAgls, category]);

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

      if (effectiveEntityType === "runway") {
        const tpLat = parseFloat(touchpointLat);
        const tpLon = parseFloat(touchpointLon);
        const tpAlt = parseFloat(touchpointAlt);
        if (!isNaN(tpLat)) data.touchpoint_latitude = tpLat;
        if (!isNaN(tpLon)) data.touchpoint_longitude = tpLon;
        if (!isNaN(tpAlt)) data.touchpoint_altitude = tpAlt;
      }

      if (effectiveEntityType.startsWith("safety_zone_")) {
        if (effectiveEntityType !== "safety_zone_airport_boundary") {
          data.altitude_floor = altFloor ? parseFloat(altFloor) : 0;
          if (altCeiling) data.altitude_ceiling = parseFloat(altCeiling);
          data.is_active = isActive;
        }
      }

      if (effectiveEntityType === "obstacle") {
        data.type = obstacleType;
        if (obstacleHeight) data.height = parseFloat(obstacleHeight);
        data.buffer_distance = bufferDistance ? parseFloat(bufferDistance) : 5.0;
        if (circleCenter) data.center = circleCenter;
        else if (pointPosition) data.center = pointPosition;
      }

      if (effectiveEntityType === "agl") {
        data.agl_type = aglType;
        data.side = aglSide;
        // glide slope is a PAPI-only concept (defined approach beam); edge lights have no vertical guidance
        if (aglType === "PAPI" && glideSlopeAngle) {
          data.glide_slope_angle = parseFloat(glideSlopeAngle);
        }
        if (distFromThreshold) data.distance_from_threshold = parseFloat(distFromThreshold);
        data.surface_id = surfaceId;
        const lat = parseFloat(manualLat);
        const lon = parseFloat(manualLon);
        if (!isNaN(lat) && !isNaN(lon)) data.center = [lon, lat];
      }

      if (effectiveEntityType === "lha") {
        data.agl_id = lhaAglId;
        data.unit_designator = nextDesignator;
        // parent agl type decides whether a blank setting_angle is allowed (PAPI -> null)
        const parentAgl = allAgls.find((a) => a.id === lhaAglId);
        if (lhaSettingAngle) {
          data.setting_angle = parseFloat(lhaSettingAngle);
        } else if (parentAgl?.agl_type === "PAPI") {
          data.setting_angle = null;
        } else {
          data.setting_angle = 0.0;
        }
        data.lamp_type = lhaLampType;
        if (lhaTolerance) data.tolerance = parseFloat(lhaTolerance);
        const lat = parseFloat(manualLat);
        const lon = parseFloat(manualLon);
        if (!isNaN(lat) && !isNaN(lon)) data.center = [lon, lat];
      }

      await onCreate(effectiveEntityType, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coordinator.creation.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  const isSafetyZone = effectiveEntityType.startsWith("safety_zone_");
  const isAirportBoundary = effectiveEntityType === "safety_zone_airport_boundary";
  const prefilledBoundary = prefilledEntityType === "safety_zone_airport_boundary";

  // auto-prefill default name when switching into airport boundary
  useEffect(() => {
    if (isAirportBoundary && !name.trim()) {
      setName(t("boundary.airportBoundary"));
    }
  }, [isAirportBoundary, name, t]);

  // auto-prefill safety zone name based on zone type + count
  useEffect(() => {
    if (!isSafetyZone || isAirportBoundary) return;
    const zoneType = SAFETY_ZONE_TYPE_MAP[effectiveEntityType] ?? effectiveEntityType;
    const sub = SAFETY_ZONE_SUBTYPES.find((s) => s.value === effectiveEntityType);
    const label = sub ? t(sub.labelKey) : zoneType;
    const count = safetyZones.filter((z) => z.type === zoneType).length;
    setName(`${label} ${count + 1}`);
  }, [effectiveEntityType, t, isSafetyZone, isAirportBoundary]); // safetyZones intentionally excluded - only prefill on type change

  // auto-prefill safety zone altitude floor from airport elevation
  useEffect(() => {
    if (!isSafetyZone || isAirportBoundary) return;
    if (airportElevation > 0) {
      setAltFloor(String(Math.round(airportElevation)));
    }
  }, [isSafetyZone, isAirportBoundary, airportElevation]);

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
    ? (SAFETY_ZONE_TYPE_MAP[effectiveEntityType] ?? effectiveEntityType)
    : "";

  const hasValidCoords = !isNaN(parseFloat(manualLat)) && !isNaN(parseFloat(manualLon));
  const canSubmit = effectiveEntityType && name.trim()
    && (effectiveEntityType !== "lha" || lhaAglId)
    && (effectiveEntityType !== "agl" || surfaceId)
    && ((effectiveEntityType !== "agl" && effectiveEntityType !== "lha") || hasValidCoords);

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
        {/* tier 1 - category selection (hidden for prefilled airport boundary) */}
        {!prefilledBoundary && (
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
        )}

        {/* tier 2 - subtype selection (for surface and safety_zone) */}
        {!prefilledBoundary && needsSubtype && category && (
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
            {/* name - always required, auto-assigned (and hidden) for airport boundary */}
            {!isAirportBoundary && (
              <Input
                id="create-name"
                label={category === "surface" ? t("coordinator.detail.surfaceIdentifier") : t("coordinator.detail.obstacleName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder()}
              />
            )}

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
                    <span className="text-[10px] text-tv-text-muted">
                      {Math.round(((parseFloat(heading) + 180) % 360) * 10) / 10}°
                    </span>
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
                {effectiveEntityType === "runway" && (
                  <div
                    className="mt-1 rounded-lg border border-tv-border bg-tv-bg p-2 space-y-1.5"
                    data-testid="creation-touchpoint-section"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-tv-text-secondary uppercase tracking-wide">
                        {t("coordinator.creation.touchpoint")}
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
                          data-testid="creation-touchpoint-pick-map"
                        >
                          <MapPin className="h-3 w-3" />
                          {t("mission.config.pickOnMap")}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        id="create-tp-lat"
                        label={t("map.coordinates.lat")}
                        type="number"
                        step="0.000001"
                        value={touchpointLat}
                        onChange={(e) => setTouchpointLat(e.target.value)}
                      />
                      <Input
                        id="create-tp-lon"
                        label={t("map.coordinates.lon")}
                        type="number"
                        step="0.000001"
                        value={touchpointLon}
                        onChange={(e) => setTouchpointLon(e.target.value)}
                      />
                    </div>
                    <Input
                      id="create-tp-alt"
                      label={t("map.coordinates.alt")}
                      type="number"
                      step="0.01"
                      value={touchpointAlt}
                      onChange={(e) => setTouchpointAlt(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {/* safety zone fields */}
            {isSafetyZone && (
              <>
                {!isAirportBoundary && (
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
                )}
                {!isAirportBoundary && (
                  <>
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
                  </>
                )}
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
                    id="create-buffer-distance"
                    label={t("coordinator.creation.bufferDistance")}
                    type="number"
                    value={bufferDistance}
                    onChange={(e) => setBufferDistance(e.target.value)}
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
                {surfaces.length > 0 ? (
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
                ) : (
                  <div
                    className="flex items-center gap-2 p-3 rounded-2xl border border-tv-warning bg-tv-warning/10"
                    data-testid="creation-no-runway-warning"
                  >
                    <AlertTriangle className="h-4 w-4 text-tv-warning flex-shrink-0" />
                    <p className="text-xs text-tv-warning">
                      {t("coordinator.creation.noRunwayWarning")}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("coordinator.creation.aglType")}
                  </label>
                  <select
                    value={aglType}
                    onChange={(e) => setAglType(e.target.value as "PAPI" | "RUNWAY_EDGE_LIGHTS")}
                    className="w-full px-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
                    data-testid="creation-agl-type-select"
                  >
                    <option value="PAPI">PAPI</option>
                    <option value="RUNWAY_EDGE_LIGHTS">{t("coordinator.agl.runwayEdgeLights")}</option>
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
                {/* glide slope is PAPI-only - edge lights have no defined approach beam */}
                {aglType === "PAPI" && (
                  <Input
                    id="create-glide"
                    label={t("coordinator.creation.glideSlopeAngle")}
                    type="number"
                    step="0.1"
                    value={glideSlopeAngle}
                    onChange={(e) => setGlideSlopeAngle(e.target.value)}
                  />
                )}
                <Input
                  id="create-dist"
                  label={t("coordinator.creation.distanceFromThreshold")}
                  type="number"
                  value={distFromThreshold}
                  onChange={(e) => setDistFromThreshold(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <Input id="create-lat" label={t("map.coordinates.lat")} type="number" step="0.000001"
                    value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                  <Input id="create-lon" label={t("map.coordinates.lon")} type="number" step="0.000001"
                    value={manualLon} onChange={(e) => setManualLon(e.target.value)} />
                  <p className="text-[10px] text-tv-text-muted">
                    {t("map.coordinates.alt")}: {airportElevation.toFixed(2)} m ({t("coordinator.creation.altFromAirport")})
                  </p>
                </div>
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
                        {formatAglDisplayName(a)}
                      </option>
                    ))}
                  </select>
                </div>
                {lhaAglId && (
                  <p className="text-[10px] text-tv-text-muted">
                    {t("coordinator.creation.unitDesignator")}: {nextDesignator}
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
                <Input
                  id="create-lha-tolerance"
                  label={t("coordinator.detail.lhaTolerance")}
                  type="number"
                  step="0.1"
                  value={lhaTolerance}
                  onChange={(e) => setLhaTolerance(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <Input id="create-lha-lat" label={t("map.coordinates.lat")} type="number" step="0.000001"
                    value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                  <Input id="create-lha-lon" label={t("map.coordinates.lon")} type="number" step="0.000001"
                    value={manualLon} onChange={(e) => setManualLon(e.target.value)} />
                  <p className="text-[10px] text-tv-text-muted">
                    {t("map.coordinates.alt")}: {airportElevation.toFixed(2)} m ({t("coordinator.creation.altFromAirport")})
                  </p>
                </div>
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
