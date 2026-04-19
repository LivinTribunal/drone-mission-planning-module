import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Entity } from "resium";
import {
  Cartesian3,
  Color,
  PolygonHierarchy,
  HeightReference,
  ClassificationType,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  NearFarScalar,
  PolylineDashMaterialProperty,
} from "cesium";
import type { AirportDetailResponse } from "@/types/airport";
import type { MapLayerConfig } from "@/types/map";
import { polygonToCartesian3, lineStringToCartesian3, bufferPolygon } from "./cesiumUtils";
import { formatAglDisplayName } from "@/utils/agl";
import {
  RUNWAY_FILL,
  RUNWAY_OUTLINE,
  TAXIWAY_FILL,
  TAXIWAY_OUTLINE,
  SAFETY_ZONE_COLORS,
  OBSTACLE_TYPE_COLORS,
  SURFACE_BUFFER_COLORS,
  AGL_COLOR,
  RUNWAY_CENTERLINE,
  TAXIWAY_CENTERLINE,
} from "./cesiumColors";

// approximate metres per degree at the equator (reserved for future use)
// const METRES_PER_DEGREE_LNG = 111320;
// const METRES_PER_DEGREE_LAT = 110540;

interface CesiumInfrastructureProps {
  airport: AirportDetailResponse;
  layers: MapLayerConfig;
  selectedFeatureKey?: string | null;
}

/** renders airport infrastructure entities (runways, taxiways, safety zones, obstacles, agl) in cesium. */
export default function CesiumInfrastructure({
  airport,
  layers,
  selectedFeatureKey,
}: CesiumInfrastructureProps) {
  const { t } = useTranslation();
  const surfaces = useMemo(() => {
    const result: JSX.Element[] = [];

    for (const surface of airport.surfaces ?? []) {
      const isRunway = surface.surface_type === "RUNWAY";
      const visible = isRunway ? layers.runways : layers.taxiways;
      if (!visible || !surface.boundary) continue;

      const positions = polygonToCartesian3(surface.boundary);
      const isSelected = selectedFeatureKey === `surface:${surface.id}`;
      const fill = isRunway ? RUNWAY_FILL : TAXIWAY_FILL;
      const outline = isSelected ? Color.WHITE : (isRunway ? RUNWAY_OUTLINE : TAXIWAY_OUTLINE);

      // compute label position from centerline midpoint, boundary centroid, or fallback
      let labelLng: number;
      let labelLat: number;
      if (surface.geometry && surface.geometry.coordinates.length >= 2) {
        const coords = surface.geometry.coordinates;
        const mid = Math.floor(coords.length / 2);
        labelLng = coords[mid][0];
        labelLat = coords[mid][1];
      } else if (surface.boundary) {
        const ring = surface.boundary.coordinates[0];
        if (!ring?.length) continue;
        labelLng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        labelLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      } else {
        labelLng = airport.location.coordinates[0];
        labelLat = airport.location.coordinates[1];
      }

      const labelText = `${isRunway ? t("map.runwayShort") : t("map.taxiwayShort")} ${surface.identifier || ""}`;

      // polygon and label as separate entities - ground-classified polygons
      // conflict with labels on the same entity
      result.push(
        <Entity
          key={`surface-${surface.id}`}
          name={surface.identifier || surface.id}
          polygon={{
            hierarchy: new PolygonHierarchy(positions),
            material: fill,
            outline: true,
            outlineColor: outline,
            outlineWidth: isSelected ? 4 : 2,
            classificationType: ClassificationType.BOTH,
          }}
          position={Cartesian3.fromDegrees(labelLng, labelLat, 0)}
          properties={{ featureType: "surface", featureId: surface.id }}
        />,
      );
      // distribute labels along centerline at regular intervals
      // interpolate positions so label count doesn't depend on vertex count
      if (surface.geometry && surface.geometry.coordinates.length >= 2) {
        const coords = surface.geometry.coordinates;
        const labelCount = isRunway ? 3 : 2;

        for (let li = 0; li < labelCount; li++) {
          // fractional position along the coordinate array (0.25, 0.5, 0.75 for 3 labels)
          const frac = (li + 1) / (labelCount + 1);
          const floatIdx = frac * (coords.length - 1);
          const idx = Math.floor(floatIdx);
          const t2 = floatIdx - idx;
          const a = coords[idx];
          const b = coords[Math.min(idx + 1, coords.length - 1)];
          const cLng = a[0] + (b[0] - a[0]) * t2;
          const cLat = a[1] + (b[1] - a[1]) * t2;

          result.push(
            <Entity
              key={`surface-label-${surface.id}-${li}`}
              position={Cartesian3.fromDegrees(cLng, cLat, 0)}
              label={{
                text: labelText,
                font: "bold 14px sans-serif",
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 3,
                style: LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: VerticalOrigin.CENTER,
                pixelOffset: new Cartesian2(0, 0),
                heightReference: HeightReference.CLAMP_TO_GROUND,
                scaleByDistance: new NearFarScalar(200, 1.2, 8000, 0.4),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
            />,
          );
        }
      } else {
        result.push(
          <Entity
            key={`surface-label-${surface.id}`}
            position={Cartesian3.fromDegrees(labelLng, labelLat, 0)}
            label={{
              text: labelText,
              font: "bold 14px sans-serif",
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 3,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.CENTER,
              pixelOffset: new Cartesian2(0, 0),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              scaleByDistance: new NearFarScalar(200, 1.2, 8000, 0.4),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }}
          />,
        );
      }

      // centerline
      if (surface.geometry) {
        const centerlinePositions = lineStringToCartesian3(surface.geometry);
        const centerlineColor = isRunway ? RUNWAY_CENTERLINE : TAXIWAY_CENTERLINE;
        result.push(
          <Entity
            key={`surface-centerline-${surface.id}`}
            polyline={{
              positions: centerlinePositions,
              width: isRunway ? 1.5 : 1,
              material: new PolylineDashMaterialProperty({
                color: centerlineColor,
                dashLength: isRunway ? 16 : 12,
              }),
              clampToGround: true,
            }}
          />,
        );
      }
    }
    return result;
  }, [airport.surfaces, airport.location, layers.runways, layers.taxiways, selectedFeatureKey, t]);

  const safetyZones = useMemo(() => {
    if (!layers.safetyZones) return [];
    const result: JSX.Element[] = [];
    for (const zone of (airport.safety_zones ?? []).filter(
      (z) => z.is_active && z.type !== "AIRPORT_BOUNDARY",
    )) {
      if (!zone.geometry) continue;
      const positions = polygonToCartesian3(zone.geometry);
      const isZoneSelected = selectedFeatureKey === `safety_zone:${zone.id}`;
      const colors = SAFETY_ZONE_COLORS[zone.type] ?? SAFETY_ZONE_COLORS.CTR;
      const ceiling = zone.altitude_ceiling ?? 500;

      // centroid for label placement
      const ring = zone.geometry.coordinates[0];
      if (!ring?.length) continue;
      const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;

      result.push(
          <Entity
            key={`zone-${zone.id}`}
            name={t("map.safetyZoneName", { type: zone.type })}
            position={Cartesian3.fromDegrees(cx, cy, 0)}
            polygon={{
              hierarchy: new PolygonHierarchy(positions),
              material: colors.fill,
              outline: true,
              outlineColor: isZoneSelected ? Color.WHITE : colors.outline,
              outlineWidth: isZoneSelected ? 4 : 2,
              height: 0,
              extrudedHeight: ceiling,
              heightReference: HeightReference.RELATIVE_TO_GROUND,
              extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
            }}
            properties={{ featureType: "safety_zone", featureId: zone.id }}
          />,
        );
      result.push(
          <Entity
            key={`zone-label-${zone.id}`}
            position={Cartesian3.fromDegrees(cx, cy, 0)}
            label={{
              text: zone.name || zone.type,
              font: "bold 12px sans-serif",
              fillColor: colors.outline,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.CENTER,
              pixelOffset: new Cartesian2(0, 0),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              scaleByDistance: new NearFarScalar(1000, 1.0, 10000, 0.3),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }}
          />,
        );
    }
    return result;
  }, [airport.safety_zones, layers.safetyZones, selectedFeatureKey, t]);

  // airport boundary - dashed outline only (no fill)
  const airportBoundary = useMemo(() => {
    if (!layers.safetyZones) return [];
    const boundary = (airport.safety_zones ?? []).find(
      (z) => z.type === "AIRPORT_BOUNDARY" && z.is_active && z.geometry,
    );
    if (!boundary || !boundary.geometry) return [];

    const outerRing = boundary.geometry.coordinates[0];
    if (!outerRing?.length) return [];

    const outlinePositions = outerRing.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 0));
    const isSelected = selectedFeatureKey === `safety_zone:${boundary.id}`;

    return [
      <Entity
        key={`airport-boundary-outline-${boundary.id}`}
        name={boundary.name || t("boundary.airportBoundary", { defaultValue: "Airport Boundary" })}
        polyline={{
          positions: outlinePositions,
          width: isSelected ? 4 : 2,
          material: new PolylineDashMaterialProperty({
            color: isSelected ? Color.WHITE : Color.WHITE.withAlpha(0.9),
            dashLength: 16,
          }),
          clampToGround: true,
        }}
        properties={{ featureType: "safety_zone", featureId: boundary.id }}
      />,
    ];
  }, [airport.safety_zones, layers.safetyZones, selectedFeatureKey, t]);

  const obstacles = useMemo(() => {
    if (!layers.obstacles) return [];
    return (airport.obstacles ?? []).map((obstacle) => {
      if (!obstacle.boundary) return null;
      const ring = obstacle.boundary.coordinates[0];
      if (!ring?.length) return null;
      const positions = ring.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 0));
      const height = obstacle.height ?? 10;
      const isObsSelected = selectedFeatureKey === `obstacle:${obstacle.id}`;
      const colors = OBSTACLE_TYPE_COLORS[obstacle.type] ?? OBSTACLE_TYPE_COLORS.OTHER;

      // centroid for label placement
      const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;

      return [
        <Entity
          key={`obstacle-${obstacle.id}`}
          polygon={{
            hierarchy: new PolygonHierarchy(positions),
            material: colors.fill,
            outline: true,
            outlineColor: isObsSelected ? Color.WHITE : colors.outline,
            outlineWidth: isObsSelected ? 3 : 1,
            height: 0,
            extrudedHeight: height,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
          }}
          properties={{ featureType: "obstacle", featureId: obstacle.id }}
        />,
        <Entity
          key={`obstacle-label-${obstacle.id}`}
          name={obstacle.name || t("map.obstacle")}
          position={Cartesian3.fromDegrees(cx, cy, height)}
          label={{
            text: `${obstacle.name || t("map.obstacle")} (${height}m)`,
            font: "12px sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -8),
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            scaleByDistance: new NearFarScalar(300, 1.0, 5000, 0.3),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }}
          properties={{ featureType: "obstacle", featureId: obstacle.id }}
        />,
      ];
    }).flat();
  }, [airport.obstacles, layers.obstacles, t, selectedFeatureKey]);

  // buffer zones for obstacles and surfaces
  const bufferZones = useMemo(() => {
    if (!layers.bufferZones) return [];
    const entities: JSX.Element[] = [];

    // obstacle buffer zones
    for (const obstacle of airport.obstacles ?? []) {
      if (!obstacle.boundary || obstacle.buffer_distance <= 0) continue;
      const ring = obstacle.boundary.coordinates[0];
      const buffered = bufferPolygon(ring, obstacle.buffer_distance);
      if (
        buffered.length > 0 &&
        (buffered[0][0] !== buffered[buffered.length - 1][0] ||
          buffered[0][1] !== buffered[buffered.length - 1][1])
      ) {
        buffered.push([...buffered[0]]);
      }
      const positions = buffered.map(([lng, lat]) =>
        Cartesian3.fromDegrees(lng, lat, 0),
      );
      const height = obstacle.height ?? 10;
      const bufferHeight = height + obstacle.buffer_distance;
      const colors = OBSTACLE_TYPE_COLORS[obstacle.type] ?? OBSTACLE_TYPE_COLORS.OTHER;

      entities.push(
        <Entity
          key={`obstacle-buffer-${obstacle.id}`}
          polygon={{
            hierarchy: new PolygonHierarchy(positions),
            material: colors.fill.withAlpha(0.1),
            outline: true,
            outlineColor: colors.outline.withAlpha(0.5),
            outlineWidth: 1,
            height: 0,
            extrudedHeight: bufferHeight,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
          }}
        />,
      );
    }

    // surface buffer zones
    for (const surface of airport.surfaces ?? []) {
      if (!surface.boundary || surface.buffer_distance <= 0) continue;
      const ring = surface.boundary.coordinates[0];
      const buffered = bufferPolygon(ring, surface.buffer_distance);
      if (
        buffered.length > 0 &&
        (buffered[0][0] !== buffered[buffered.length - 1][0] ||
          buffered[0][1] !== buffered[buffered.length - 1][1])
      ) {
        buffered.push([...buffered[0]]);
      }
      const positions = buffered.map(([lng, lat]) =>
        Cartesian3.fromDegrees(lng, lat, 0),
      );
      const colors = SURFACE_BUFFER_COLORS[surface.surface_type] ?? SURFACE_BUFFER_COLORS.RUNWAY;

      entities.push(
        <Entity
          key={`surface-buffer-${surface.id}`}
          polygon={{
            hierarchy: new PolygonHierarchy(positions),
            material: colors.fill,
            outline: true,
            outlineColor: colors.outline,
            outlineWidth: 1,
            height: 0,
            extrudedHeight: surface.buffer_distance,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
          }}
        />,
      );
    }

    return entities;
  }, [airport.obstacles, airport.surfaces, layers.bufferZones]);

  const aglSystems = useMemo(() => {
    if (!layers.aglSystems) return [];
    const entities: JSX.Element[] = [];

    for (const surface of airport.surfaces ?? []) {
      for (const agl of surface.agls ?? []) {
        if (!agl.position) continue;
        const [lng, lat] = agl.position.coordinates;
        const isAglSelected = selectedFeatureKey === `agl:${agl.id}`;

        entities.push(
          <Entity
            key={`agl-${agl.id}`}
            name={`AGL ${agl.id.slice(0, 8)}`}
            position={Cartesian3.fromDegrees(lng, lat, 0)}
            point={{
              pixelSize: isAglSelected ? 15 : 10,
              color: isAglSelected ? Color.WHITE : AGL_COLOR,
              outlineColor: isAglSelected ? AGL_COLOR : Color.WHITE,
              outlineWidth: 2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            }}
            label={{
              text: (agl.name ? formatAglDisplayName(agl, surface) : t("map.aglLabel")),
              font: "10px sans-serif",
              fillColor: AGL_COLOR,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -12),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              scaleByDistance: new NearFarScalar(200, 1.0, 3000, 0.0),
            }}
            properties={{ featureType: "agl", featureId: agl.id }}
          />,
        );

        // lha billboards
        for (const lha of agl.lhas ?? []) {
          if (!lha.position) continue;
          const [lhaLng, lhaLat] = lha.position.coordinates;
          const isLhaSelected = selectedFeatureKey === `lha:${lha.id}`;
          entities.push(
            <Entity
              key={`lha-${lha.id}`}
              name={t("map.lhaName", { unit: lha.unit_designator ?? "" })}
              position={Cartesian3.fromDegrees(lhaLng, lhaLat, 0)}
              point={{
                pixelSize: isLhaSelected ? 15 : 10,
                color: isLhaSelected ? Color.WHITE : AGL_COLOR,
                outlineColor: isLhaSelected ? AGL_COLOR : Color.WHITE,
                outlineWidth: 2,
                heightReference: HeightReference.CLAMP_TO_GROUND,
              }}
              label={{
                text: t("map.lhaLabelWithAngle", {
                  unit: lha.unit_designator ?? "",
                  angle: lha.setting_angle ?? 0,
                }),
                font: "10px sans-serif",
                fillColor: AGL_COLOR,
                outlineColor: Color.BLACK,
                outlineWidth: 1,
                style: LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian2(0, -14),
                heightReference: HeightReference.CLAMP_TO_GROUND,
                scaleByDistance: new NearFarScalar(200, 1.0, 3000, 0.0),
              }}
              properties={{ featureType: "lha", featureId: lha.id }}
            />,
          );
        }
      }
    }
    return entities;
  }, [airport.surfaces, layers.aglSystems, t, selectedFeatureKey]);

  return (
    <>
      {surfaces}
      {safetyZones}
      {airportBoundary}
      {obstacles}
      {bufferZones}
      {aglSystems}
    </>
  );
}
