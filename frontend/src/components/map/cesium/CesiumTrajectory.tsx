import { useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCesium } from "resium";
import {
  ArcType,
  Cartesian3,
  Color,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  NearFarScalar,
  CustomDataSource,
  PropertyBag,
  PolylineDashMaterialProperty,
} from "cesium";
import type { Entity as CesiumEntity } from "cesium";
import type { WaypointResponse } from "@/types/flightPlan";
import type { PointZ } from "@/types/common";
import type { MapLayerConfig } from "@/types/map";
import {
  TRANSIT_COLOR,
  MEASUREMENT_COLOR,
  TAKEOFF_COLOR,
  LANDING_COLOR,
} from "./cesiumColors";

interface CesiumTrajectoryProps {
  waypoints: WaypointResponse[];
  layers: MapLayerConfig;
  selectedWaypointId?: string | null;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  visibleInspectionIds?: Set<string>;
  showSimplified?: boolean;
  airportElevation?: number;
  /** ellipsoid-geoid offset: cesium terrain height minus airport MSL elevation. */
  terrainOffset?: number;
  highlightedWaypointIds?: string[] | null;
}

/** convert MSL altitude to cesium ellipsoidal height. */
function toEllipsoidal(lng: number, lat: number, altMsl: number, offset: number): Cartesian3 {
  return Cartesian3.fromDegrees(lng, lat, altMsl + offset);
}

/** polyline material can be a solid color or a dashed material property. */
type PolylineMaterial = Color | PolylineDashMaterialProperty;

/** build polyline entity options with explicit non-clamping 3D rendering.
 * ensures the line is drawn at absolute ellipsoidal altitudes, not snapped
 * to terrain. exported for unit testing. */
export function buildPolylineOptions(
  positions: Cartesian3[],
  width: number,
  material: PolylineMaterial,
  depthFailMaterial: PolylineMaterial,
): CesiumEntity.ConstructorOptions {
  return {
    polyline: {
      positions,
      width,
      material,
      depthFailMaterial,
      clampToGround: false,
      arcType: ArcType.NONE,
    },
  } as CesiumEntity.ConstructorOptions;
}

/** get color for a waypoint dot based on its type and inspection index. */
function getWaypointColor(wp: WaypointResponse): Color {
  if (wp.waypoint_type === "TRANSIT") return Color.WHITE;
  if (wp.waypoint_type === "TAKEOFF") return TAKEOFF_COLOR;
  if (wp.waypoint_type === "LANDING") return LANDING_COLOR;
  if (wp.waypoint_type === "HOVER") return Color.fromCssColorString("#e5a545");
  return MEASUREMENT_COLOR;
}

/** get color for a path segment leading to a waypoint. */
function getSegmentColor(toType: string): Color {
  if (toType === "TRANSIT" || toType === "TAKEOFF" || toType === "LANDING") {
    return TRANSIT_COLOR;
  }
  return MEASUREMENT_COLOR;
}

/** create a PropertyBag for entity click handling. */
function makeProperties(featureType: string, featureId: string): PropertyBag {
  const props = new PropertyBag();
  props.addProperty("featureType", featureType);
  props.addProperty("featureId", featureId);
  return props;
}

/** add color-coded path segments between consecutive waypoints. */
function addPathSegments(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  terrainOffset: number,
  width: number,
  takeoff: PointZ | null | undefined,
  landing: PointZ | null | undefined,
  showTakeoffLanding: boolean,
): void {
  const sorted = [...waypoints].sort((a, b) => a.sequence_order - b.sequence_order);
  if (sorted.length < 1) return;

  // takeoff -> first waypoint
  if (showTakeoffLanding && takeoff) {
    const [tLng, tLat, tAlt] = takeoff.coordinates;
    const [wLng, wLat, wAlt] = sorted[0].position.coordinates;
    const color = TRANSIT_COLOR;
    ds.entities.add(buildPolylineOptions(
      [
        toEllipsoidal(tLng, tLat, tAlt ?? 0, terrainOffset),
        toEllipsoidal(wLng, wLat, wAlt ?? 0, terrainOffset),
      ],
      width,
      color,
      color,
    ));
  }

  // waypoint-to-waypoint segments
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const [fLng, fLat, fAlt] = from.position.coordinates;
    const [tLng, tLat, tAlt] = to.position.coordinates;
    const color = getSegmentColor(to.waypoint_type);
    ds.entities.add(buildPolylineOptions(
      [
        toEllipsoidal(fLng, fLat, fAlt ?? 0, terrainOffset),
        toEllipsoidal(tLng, tLat, tAlt ?? 0, terrainOffset),
      ],
      width,
      color,
      color,
    ));
  }

  // last waypoint -> landing
  if (showTakeoffLanding && landing) {
    const last = sorted[sorted.length - 1];
    const [wLng, wLat, wAlt] = last.position.coordinates;
    const [lLng, lLat, lAlt] = landing.coordinates;
    const color = TRANSIT_COLOR;
    ds.entities.add(buildPolylineOptions(
      [
        toEllipsoidal(wLng, wLat, wAlt ?? 0, terrainOffset),
        toEllipsoidal(lLng, lLat, lAlt ?? 0, terrainOffset),
      ],
      width,
      color,
      color,
    ));
  }
}

/** add direction arrows along path segments at regular intervals (~80m spacing). */
function addPathArrows(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  terrainOffset: number,
): void {
  const sorted = [...waypoints].sort((a, b) => a.sequence_order - b.sequence_order);
  if (sorted.length < 2) return;

  const ARROW_SPACING_DEG = 0.0007; // ~80m at mid-latitudes

  for (let i = 0; i < sorted.length - 1; i++) {
    const [fLng, fLat, fAlt] = sorted[i].position.coordinates;
    const [tLng, tLat, tAlt] = sorted[i + 1].position.coordinates;
    const dLng = tLng - fLng;
    const dLat = tLat - fLat;
    const segLen = Math.sqrt(dLng * dLng + dLat * dLat);
    if (segLen < 0.00001) continue;

    // number of arrows based on segment length
    const count = Math.max(1, Math.floor(segLen / ARROW_SPACING_DEG));

    for (let a = 0; a < count; a++) {
      const frac = (a + 1) / (count + 1);
      const mLng = fLng + dLng * frac;
      const mLat = fLat + dLat * frac;
      const mAlt = (fAlt ?? 0) + ((tAlt ?? 0) - (fAlt ?? 0)) * frac;

      ds.entities.add({
        position: toEllipsoidal(mLng, mLat, mAlt, terrainOffset),
        label: {
          text: "\u25B6",
          font: "10px sans-serif",
          fillColor: Color.WHITE.withAlpha(0.7),
          style: LabelStyle.FILL,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(0, 0),
          scaleByDistance: new NearFarScalar(100, 0.8, 5000, 0.3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }
}

/** add waypoint dot and label entities. */
function addWaypointDots(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  selectedWaypointId: string | null | undefined,
  terrainOffset: number,
  highlightedIds?: string[] | null,
): void {
  const highlightSet = highlightedIds ? new Set(highlightedIds) : null;

  for (const wp of waypoints) {
    // skip takeoff/landing - rendered separately by addTakeoffLanding
    if (wp.waypoint_type === "TAKEOFF" || wp.waypoint_type === "LANDING") continue;

    const [lng, lat, alt] = wp.position.coordinates;
    const isSelected = selectedWaypointId != null && selectedWaypointId === wp.id;
    const isHighlighted = highlightSet?.has(wp.id) ?? false;
    const color = getWaypointColor(wp);
    const isMeasurement = wp.waypoint_type === "MEASUREMENT";
    const isTransit = wp.waypoint_type === "TRANSIT";
    const pixelSize = isSelected ? 18 : (isMeasurement ? 10 : 9);

    ds.entities.add({
      name: `WP ${wp.sequence_order}`,
      position: toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
      point: {
        pixelSize,
        color: isSelected ? Color.CYAN : color,
        outlineColor: isSelected ? Color.WHITE : (isTransit ? Color.fromCssColorString("#6b6b6b") : Color.WHITE),
        outlineWidth: isSelected ? 4 : 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(wp.sequence_order),
        font: "bold 12px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        scaleByDistance: new NearFarScalar(100, 1.0, 8000, 0.4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: makeProperties("waypoint", wp.id),
    } as CesiumEntity.ConstructorOptions);

    // warning highlight ring
    if (isHighlighted) {
      ds.entities.add({
        position: toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
        point: {
          pixelSize: 22,
          color: Color.TRANSPARENT,
          outlineColor: Color.fromCssColorString("#e54545"),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }
}

/** add takeoff and landing markers with vertical ground lines. */
function addTakeoffLanding(
  ds: CustomDataSource,
  takeoff: PointZ | null | undefined,
  landing: PointZ | null | undefined,
  airportElevation: number,
  terrainOffset: number,
  takeoffLabel: string,
  landingLabel: string,
): void {
  const addMarker = (
    coord: PointZ,
    color: Color,
    label: string,
    waypointType: string,
  ) => {
    const [lng, lat, alt] = coord.coordinates;
    ds.entities.add({
      name: label,
      position: toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
      point: {
        pixelSize: 18,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: label,
        font: "bold 13px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: makeProperties("waypoint", waypointType.toLowerCase()),
    } as CesiumEntity.ConstructorOptions);

    // vertical line from ground to marker
    ds.entities.add(buildPolylineOptions(
      [
        toEllipsoidal(lng, lat, airportElevation, terrainOffset),
        toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
      ],
      1.5,
      color.withAlpha(0.5),
      color.withAlpha(0.2),
    ));
  };

  if (takeoff) addMarker(takeoff, TAKEOFF_COLOR, takeoffLabel, "TAKEOFF");
  if (landing) addMarker(landing, LANDING_COLOR, landingLabel, "LANDING");
}

/** add dashed camera heading lines from measurement waypoints to their targets. */
function addCameraHeadingLines(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  terrainOffset: number,
): void {
  for (const wp of waypoints) {
    if (wp.waypoint_type !== "MEASUREMENT" || !wp.camera_target) continue;
    const [lng, lat, alt] = wp.position.coordinates;
    const [tLng, tLat, tAlt] = wp.camera_target.coordinates;
    const color = getWaypointColor(wp).withAlpha(0.4);
    ds.entities.add(buildPolylineOptions(
      [
        toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
        toEllipsoidal(tLng, tLat, tAlt ?? 0, terrainOffset),
      ],
      1,
      new PolylineDashMaterialProperty({
        color,
        dashLength: 8,
      }),
      color,
    ));
  }
}

/** add corner dots for simplified trajectory at direction changes >10 degrees. */
function addCornerDots(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  terrainOffset: number,
): void {
  const sorted = [...waypoints].sort((a, b) => a.sequence_order - b.sequence_order);
  if (sorted.length < 3) return;

  for (let i = 1; i < sorted.length - 1; i++) {
    const type = sorted[i].waypoint_type;
    if (type === "TAKEOFF" || type === "LANDING") continue;

    const prev = sorted[i - 1].position.coordinates;
    const curr = sorted[i].position.coordinates;
    const next = sorted[i + 1].position.coordinates;

    // mark type transitions (e.g. transit -> measurement entry)
    const prevType = sorted[i - 1].waypoint_type;
    if (prevType !== type && type !== "TRANSIT") {
      ds.entities.add({
        position: toEllipsoidal(curr[0], curr[1], curr[2] ?? 0, terrainOffset),
        point: {
          pixelSize: 4,
          color: Color.BLACK,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      continue;
    }

    // direction change angle
    const dxA = curr[0] - prev[0];
    const dyA = curr[1] - prev[1];
    const dxB = next[0] - curr[0];
    const dyB = next[1] - curr[1];
    const dot = dxA * dxB + dyA * dyB;
    const magA = Math.sqrt(dxA * dxA + dyA * dyA);
    const magB = Math.sqrt(dxB * dxB + dyB * dyB);
    if (magA === 0 || magB === 0) continue;
    const cosAngle = dot / (magA * magB);

    // ~10 degree threshold
    if (cosAngle < 0.985) {
      ds.entities.add({
        position: toEllipsoidal(curr[0], curr[1], curr[2] ?? 0, terrainOffset),
        point: {
          pixelSize: 4,
          color: Color.BLACK,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }
}

/** add stacked measurement dots where multiple waypoints share a ground position. */
function addStackedMeasurementDots(
  ds: CustomDataSource,
  waypoints: WaypointResponse[],
  terrainOffset: number,
): void {
  // group by ground position (rounded to ~1m precision)
  const groups = new Map<string, WaypointResponse[]>();
  for (const wp of waypoints) {
    if (wp.waypoint_type !== "MEASUREMENT" && wp.waypoint_type !== "HOVER") continue;
    const [lng, lat] = wp.position.coordinates;
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    const list = groups.get(key) ?? [];
    list.push(wp);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const [lng, lat, alt] = group[0].position.coordinates;
    ds.entities.add({
      position: toEllipsoidal(lng, lat, alt ?? 0, terrainOffset),
      point: {
        pixelSize: 6,
        color: MEASUREMENT_COLOR,
        outlineColor: Color.WHITE,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

/** renders trajectory entities (waypoints, flight path, takeoff/landing) in cesium
 * using an imperative CustomDataSource for reliable entity creation. */
export default function CesiumTrajectory({
  waypoints,
  layers,
  selectedWaypointId,
  takeoffCoordinate,
  landingCoordinate,
  visibleInspectionIds,
  showSimplified,
  airportElevation = 0,
  terrainOffset = 0,
  highlightedWaypointIds,
}: CesiumTrajectoryProps) {
  const { t } = useTranslation();
  const { viewer } = useCesium();
  // two datasources: lines render first, dots on top (separate render passes)
  const linesRef = useRef<CustomDataSource | null>(null);
  const dotsRef = useRef<CustomDataSource | null>(null);

  // filter visible waypoints - allow simplified OR full trajectory
  const visibleWaypoints = useMemo(() => {
    if (!layers.trajectory && !showSimplified) return [];
    return waypoints.filter((wp) => {
      if (wp.waypoint_type === "TRANSIT") return showSimplified || layers.transitWaypoints;
      if (wp.waypoint_type === "MEASUREMENT") {
        if (!showSimplified && !layers.measurementWaypoints) return false;
        if (visibleInspectionIds && wp.inspection_id) {
          return visibleInspectionIds.has(wp.inspection_id);
        }
        return true;
      }
      return true;
    });
  }, [waypoints, layers, visibleInspectionIds, showSimplified]);

  // create two datasources on mount - lines first, dots second for z-order
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // aggressively remove ALL trajectory datasources (handles HMR, strict mode, renames)
    for (const name of ["trajectory", "trajectory-lines", "trajectory-dots"]) {
      let stale = viewer.dataSources.getByName(name);
      while (stale.length > 0) {
        viewer.dataSources.remove(stale[0]);
        stale = viewer.dataSources.getByName(name);
      }
    }

    const lines = new CustomDataSource("trajectory-lines");
    const dots = new CustomDataSource("trajectory-dots");
    viewer.dataSources.add(lines);
    viewer.dataSources.add(dots);
    linesRef.current = lines;
    dotsRef.current = dots;
    return () => {
      linesRef.current = null;
      dotsRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(lines);
        viewer.dataSources.remove(dots);
      }
    };
  }, [viewer]);

  // rebuild all entities on any data change
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // remove any stale datasources not owned by this instance
    for (const name of ["trajectory", "trajectory-lines", "trajectory-dots"]) {
      const all = viewer.dataSources.getByName(name);
      for (let i = 0; i < all.length; i++) {
        if (all[i] !== linesRef.current && all[i] !== dotsRef.current) {
          viewer.dataSources.remove(all[i]);
        }
      }
    }

    const lines = linesRef.current;
    const dots = dotsRef.current;
    if (!lines || !dots) return;
    lines.entities.removeAll();
    dots.entities.removeAll();

    if (visibleWaypoints.length === 0 && !takeoffCoordinate && !landingCoordinate) return;

    const takeoffLabel = t("map.takeoffLabel");
    const landingLabel = t("map.landingLabel");

    if (showSimplified) {
      addPathSegments(lines, visibleWaypoints, terrainOffset, 5,
        takeoffCoordinate, landingCoordinate, true);
      addCornerDots(dots, visibleWaypoints, terrainOffset);
      addStackedMeasurementDots(dots, visibleWaypoints, terrainOffset);
      addTakeoffLanding(dots, takeoffCoordinate, landingCoordinate,
        airportElevation, terrainOffset, takeoffLabel, landingLabel);
    } else {
      // lines datasource: path, camera heading, arrows
      if (layers.cameraHeading) {
        addCameraHeadingLines(lines, visibleWaypoints, terrainOffset);
      }
      if (layers.path) {
        addPathSegments(lines, visibleWaypoints, terrainOffset, 3,
          takeoffCoordinate, landingCoordinate, layers.takeoffLanding);
      }
      if (layers.pathHeading) {
        addPathArrows(lines, visibleWaypoints, terrainOffset);
      }
      // dots datasource: markers and labels (renders on top)
      if (layers.takeoffLanding) {
        addTakeoffLanding(dots, takeoffCoordinate, landingCoordinate,
          airportElevation, terrainOffset, takeoffLabel, landingLabel);
      }
      addWaypointDots(dots, visibleWaypoints, selectedWaypointId,
        terrainOffset, highlightedWaypointIds);
    }
  }, [viewer, visibleWaypoints, selectedWaypointId, terrainOffset,
    takeoffCoordinate, landingCoordinate,
    showSimplified, layers.path, layers.takeoffLanding, layers.cameraHeading,
    layers.pathHeading, airportElevation, highlightedWaypointIds, t]);

  return null;
}
