import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { getAirport } from "@/api/airports";
import {
  deleteSurface,
  deleteObstacle,
  deleteSafetyZone,
  deleteAGL,
  updateSurface,
  updateObstacle,
  updateSafetyZone,
  updateAGL,
  updateLHA,
  updateAirport,
} from "@/api/airports";
import { useAirport } from "@/contexts/AirportContext";
import { OBSTACLE_COLORS, ObstacleTypeIcon } from "@/components/map/obstacleIcons";
import type { AirportDetailResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";

const ZONE_COLORS: Record<string, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import AirportMap from "@/components/map/AirportMap";
import type { AirportMapHandle } from "@/components/map/AirportMap";
import LegendPanel from "@/components/map/overlays/LegendPanel";
import InfrastructureListPanel from "@/components/coordinator/InfrastructureListPanel";
import CoordinatorAGLPanel from "@/components/coordinator/CoordinatorAGLPanel";
import AirportInfoPanel from "@/components/coordinator/AirportInfoPanel";
import TerrainSettingsCard from "@/components/coordinator/TerrainSettingsCard";
import EditableFeatureInfo from "@/components/coordinator/EditableFeatureInfo";
import CreationForm from "@/components/coordinator/CreationForm";
import type { PendingGeometryType } from "@/components/coordinator/CreationForm";
import UnsavedChangesDialog from "@/components/coordinator/UnsavedChangesDialog";
import MapDrawingToolbar from "@/components/coordinator/MapDrawingToolbar";
import CoordinatorMapHelpPanel from "@/components/coordinator/CoordinatorMapHelpPanel";
import GeoJsonEditorModal from "@/components/coordinator/GeoJsonEditorModal";
import useDirtyState from "@/hooks/useDirtyState";
import useMapDrawing from "@/hooks/useMapDrawing";
import useDrawPolygon from "@/hooks/useDrawPolygon";
import useDrawCircle from "@/hooks/useDrawCircle";
import type { CircleResult } from "@/hooks/useDrawCircle";
import useDrawRectangle from "@/hooks/useDrawRectangle";
import usePlacePoint from "@/hooks/usePlacePoint";
import {
  createSurface,
  createObstacle,
  createSafetyZone,
  createAGL,
  createLHA,
} from "@/api/airports";
import useVertexEditor from "@/hooks/useVertexEditor";
import type { VertexGeometryUpdate } from "@/hooks/useVertexEditor";
import useMeasureDistance from "@/hooks/useMeasureDistance";
import useHeadingTool from "@/hooks/useHeadingTool";
import MeasureInfoCard from "@/components/map/overlays/MeasureInfoCard";
import HeadingInfoCard from "@/components/map/overlays/HeadingInfoCard";
import type maplibregl from "maplibre-gl";
import { extractCenterline, circleToPolygon, haversineDistance, computeBearing } from "@/utils/geo";
import type { DrawingTool } from "@/types/map";
import { MapTool } from "@/hooks/useMapTools";

// tracks current feature collections per source for live geometry preview updates
const sourceDataCache = new Map<string, GeoJSON.FeatureCollection>();

function snapshotSource(map: maplibregl.Map, sourceName: string): GeoJSON.FeatureCollection | null {
  /** snapshot current features from a map source into cache via public api. */
  const rendered = map.querySourceFeatures(sourceName);
  if (!rendered.length) return null;
  // strip maplibre-internal fields, keep only standard geojson
  const features: GeoJSON.Feature[] = rendered.map((f) => ({
    type: "Feature",
    properties: f.properties,
    geometry: f.geometry,
  }));
  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  sourceDataCache.set(sourceName, fc);
  return fc;
}

function updateSourceFeatureGeometry(
  map: maplibregl.Map,
  sourceName: string,
  featureId: string,
  geometry: GeoJSON.Geometry,
) {
  /** update a single feature's geometry in a geojson source for live preview. */
  const src = map.getSource(sourceName) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const fc = sourceDataCache.get(sourceName) ?? snapshotSource(map, sourceName);
  if (!fc?.features) return;
  const updated = {
    ...fc,
    features: fc.features.map((f) =>
      f.properties?.id === featureId ? { ...f, geometry } : f,
    ),
  };
  sourceDataCache.set(sourceName, updated);
  src.setData(updated);
}

const DRAWING_TOOL_TO_MAP_TOOL: Record<DrawingTool, MapTool> = {
  select: MapTool.SELECT,
  pan: MapTool.PAN,
  measurement: MapTool.MEASURE,
  heading: MapTool.HEADING,
  zoom: MapTool.ZOOM,
  zoomReset: MapTool.ZOOM_RESET,
  drawPolygon: MapTool.SELECT,
  drawCircle: MapTool.SELECT,
  drawRectangle: MapTool.SELECT,
  placePoint: MapTool.SELECT,
  geoJsonEditor: MapTool.SELECT,
};

const DRAWING_TOOLS: DrawingTool[] = [
  "drawPolygon", "drawCircle", "drawRectangle", "placePoint", "heading", "measurement",
];

export default function AirportEditPage() {
  /** full airport detail editor with map, drawing tools, and infrastructure crud. */
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectAirport } = useAirport();
  const selectAirportRef = useRef(selectAirport);
  selectAirportRef.current = selectAirport;

  const [airport, setAirport] = useState<AirportDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  const [layerConfig, setLayerConfig] = useState<MapLayerConfig>(DEFAULT_LAYER_CONFIG);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [showGeoJsonEditor, setShowGeoJsonEditor] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [bearing, setBearing] = useState(0);
  const [bearingResetKey, setBearingResetKey] = useState(0);

  const { isDirty, markDirty, clearAll, getPendingChanges } = useDirtyState();
  const { activeTool, setActiveTool, canUndo, canRedo, undo, redo } = useMapDrawing();
  const mapTool = DRAWING_TOOL_TO_MAP_TOOL[activeTool] ?? MapTool.SELECT;
  const isDrawingActive = DRAWING_TOOLS.includes(activeTool);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [pendingLhaParentAglId, setPendingLhaParentAglId] = useState<string | null>(null);

  // fetch airport data - declared early so drawing hooks can reference it
  const initialLoadDone = useRef(false);
  const fetchAirport = useCallback(async (): Promise<AirportDetailResponse | null> => {
    /** fetch airport detail data. */
    if (!id) return null;
    if (!initialLoadDone.current) setLoading(true);
    setError(false);
    try {
      const data = await getAirport(id);
      setAirport(data);
      initialLoadDone.current = true;
      return data;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  // map ref for drawing hooks
  const mapHandleRef = useRef<AirportMapHandle>(null);
  const getMap = useCallback(() => mapHandleRef.current?.getMap() ?? null, []);

  // pending geometry from drawing tools
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSON.Polygon | null>(null);
  const [pendingGeometryType, setPendingGeometryType] = useState<PendingGeometryType>("polygon");
  const [pendingCircleRadius, setPendingCircleRadius] = useState<number | undefined>();
  const [pendingCircleCenter, setPendingCircleCenter] = useState<[number, number] | undefined>();
  const [pendingPointPosition, setPendingPointPosition] = useState<[number, number] | undefined>();

  // drawing completion handlers
  const handlePolygonComplete = useCallback((polygon: GeoJSON.Polygon) => {
    /** handle completed polygon from draw polygon tool. */
    setPendingGeometry(polygon);
    setPendingGeometryType("polygon");
    setPendingCircleRadius(undefined);
    setPendingCircleCenter(undefined);
    setPendingPointPosition(undefined);
    setActiveTool("select");
  }, [setActiveTool]);

  const handleCircleComplete = useCallback((result: CircleResult) => {
    /** handle completed circle from draw circle tool. */
    setPendingGeometry(result.polygon);
    setPendingGeometryType("circle");
    setPendingCircleRadius(result.radius);
    setPendingCircleCenter(result.center);
    setPendingPointPosition(undefined);
    setActiveTool("select");
  }, [setActiveTool]);

  const handleRectangleComplete = useCallback((polygon: GeoJSON.Polygon) => {
    /** handle completed rectangle from draw rectangle tool. */
    setPendingGeometry(polygon);
    setPendingGeometryType("polygon");
    setPendingCircleRadius(undefined);
    setPendingCircleCenter(undefined);
    setPendingPointPosition(undefined);
    setActiveTool("select");
  }, [setActiveTool]);

  const handlePointComplete = useCallback((point: [number, number]) => {
    /** handle completed point from place point tool. */
    setPendingGeometry(null);
    setPendingCircleRadius(undefined);
    setPendingCircleCenter(undefined);
    setPendingPointPosition(point);

    setPendingGeometryType("point");

    setActiveTool("select");
  }, [setActiveTool]);

  // wire drawing hooks
  const map = getMap();
  useDrawPolygon(map, activeTool === "drawPolygon", handlePolygonComplete);
  useDrawCircle(map, activeTool === "drawCircle", handleCircleComplete);
  useDrawRectangle(map, activeTool === "drawRectangle", handleRectangleComplete, bearing);
  usePlacePoint(map, activeTool === "placePoint", handlePointComplete);

  // vertex editor for selected features
  const handleVertexGeometryUpdate = useCallback(
    (featureType: string, featureId: string, update: VertexGeometryUpdate) => {
      /** handle geometry update from vertex editor - mark dirty and update map preview. */
      // only include api-safe fields in dirty data (exclude `polygon` which is preview-only)
      const dirtyData: Record<string, unknown> = { geometry: update.geometry };
      if (update.boundary) dirtyData.boundary = update.boundary;
      if (update.width != null) dirtyData.width = update.width;
      if (update.length != null) dirtyData.length = update.length;
      if (update.heading != null) dirtyData.heading = update.heading;
      markDirty(featureType, featureId, "update", dirtyData);

      // live preview: update map source so the shape moves with the vertices
      const m = getMap();
      if (!m) return;

      if (featureType === "safety_zone") {
        updateSourceFeatureGeometry(m, "safety-zones", featureId, update.geometry);
      } else if (featureType === "obstacle") {
        // update boundary polygon
        if (update.boundary) {
          updateSourceFeatureGeometry(m, "obstacles-boundary", featureId, update.boundary);
          // sync icon/label point to new centroid
          const ring = (update.boundary as GeoJSON.Polygon).coordinates[0];
          const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
          const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
          const cz = ring.reduce((s, c) => s + (c[2] ?? 0), 0) / ring.length;
          updateSourceFeatureGeometry(m, "obstacles", featureId, {
            type: "Point",
            coordinates: [cx, cy, cz],
          });
        }
      } else if (featureType === "surface") {
        const surfaceData = airport?.surfaces.find((s) => s.id === featureId);
        if (!surfaceData) return;
        const surfaceType = surfaceData.surface_type;
        const polySource = surfaceType === "RUNWAY" ? "runways-polygon" : "taxiways-polygon";
        const clSource = surfaceType === "RUNWAY" ? "runways" : "taxiways";

        // live preview: use the boundary polygon directly
        if (update.boundary) {
          updateSourceFeatureGeometry(m, polySource, featureId, update.boundary);
        } else if (update.polygon) {
          updateSourceFeatureGeometry(m, polySource, featureId, update.polygon);
        }

        // update centerline source so labels/dashes follow
        if (update.geometry.type === "LineString") {
          updateSourceFeatureGeometry(m, clSource, featureId, update.geometry);
        }
      }
    },
    [markDirty, getMap, airport],
  );

  useVertexEditor(map, selectedFeature, activeTool === "select", handleVertexGeometryUpdate);

  // measurement and heading tools
  const measure = useMeasureDistance();
  const heading = useHeadingTool();
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const headingRef = useRef(heading);
  headingRef.current = heading;
  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      /** handle map click for measurement and heading tools. */
      const m = measureRef.current;
      const h = headingRef.current;
      if (mapTool === MapTool.MEASURE && (m.isDrawing || !m.hasPoints)) {
        m.addPoint(lngLat.lng, lngLat.lat);
      } else if (mapTool === MapTool.HEADING) {
        h.addPoint(lngLat.lng, lngLat.lat);
      }
    },
    [mapTool],
  );

  // cancel pending creation when user picks another drawing tool, clear tools on switch
  const SAFE_TOOLS: DrawingTool[] = ["select", "pan", "zoom", "zoomReset", "measurement", "heading"];
  const handleToolChange = useCallback((tool: DrawingTool) => {
    /** handle toolbar tool change, cancelling pending creation if needed. */
    setActiveTool(tool);

    // dismiss heading when switching away from heading
    if (tool !== "heading") headingRef.current.dismiss();
    // dismiss measurement when switching away from measurement
    if (tool !== "measurement") measureRef.current.dismiss();

    if (SAFE_TOOLS.includes(tool)) return;
    if (!(pendingGeometry || pendingPointPosition)) return;
    setPendingGeometry(null);
    setPendingPointPosition(undefined);
    setPendingCircleCenter(undefined);
    setPendingCircleRadius(undefined);
    setPendingLhaParentAglId(null);
  }, [setActiveTool, pendingGeometry, pendingPointPosition]);

  const handleCreationCancel = useCallback(() => {
    /** cancel pending creation and clear geometry. */
    setPendingGeometry(null);
    setPendingPointPosition(undefined);
    setPendingCircleCenter(undefined);
    setPendingCircleRadius(undefined);
    setPendingLhaParentAglId(null);
  }, []);

  const handleAddLha = useCallback((aglId: string) => {
    /** start lha creation workflow - switch to place point tool with parent agl context. */
    setPendingLhaParentAglId(aglId);
    setSelectedFeature(null);
    setActiveTool("placePoint");
  }, [setActiveTool]);

  const handleCreate = useCallback(
    async (entityType: string, data: Record<string, unknown>) => {
      /** create entity from the creation form. */
      if (!id || !airport) throw new Error("missing airport context");
      const elevation = airport.elevation;

      if (entityType === "runway" || entityType === "taxiway") {
        if (!pendingGeometry) throw new Error("missing geometry");
        const ring = pendingGeometry.coordinates[0] as [number, number][];

        // store the drawn polygon as boundary (source of truth)
        const boundaryCoords: [number, number, number][][] = pendingGeometry.coordinates.map((r) =>
          (r as [number, number][]).map(([lng, lat]): [number, number, number] => [lng, lat, elevation]),
        );

        // derive centerline from the polygon for labels/dashes
        const centerline = extractCenterline(ring);
        const geomCoords: [number, number, number][] = centerline.map(([lng, lat]) => [lng, lat, elevation]);

        // derive width/length/heading from polygon for metadata
        const pts = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
          ? ring.slice(0, -1) : ring;
        let drawnWidth: number | undefined;
        let drawnLength: number | undefined;
        if (pts.length === 4) {
          const d01 = haversineDistance(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
          const d12 = haversineDistance(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
          if (d01 >= d12) {
            drawnLength = d01;
            drawnWidth = (d12 + haversineDistance(pts[3][0], pts[3][1], pts[0][0], pts[0][1])) / 2;
          } else {
            drawnLength = d12;
            drawnWidth = (d01 + haversineDistance(pts[2][0], pts[2][1], pts[3][0], pts[3][1])) / 2;
          }
        }
        const dLng = centerline[1][0] - centerline[0][0];
        const dLat = centerline[1][1] - centerline[0][1];
        const drawnHeading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;

        const computedWidth = drawnWidth != null ? Math.round(drawnWidth * 100) / 100 : undefined;
        await createSurface(id, {
          identifier: String(data.name ?? ""),
          surface_type: entityType === "runway" ? "RUNWAY" : "TAXIWAY",
          geometry: { type: "LineString", coordinates: geomCoords },
          boundary: { type: "Polygon", coordinates: boundaryCoords },
          heading: drawnHeading != null ? Math.round(drawnHeading * 10) / 10 : undefined,
          length: drawnLength != null ? Math.round(drawnLength * 100) / 100 : undefined,
          width: entityType === "runway" ? computedWidth : undefined,
        });
      } else if (entityType.startsWith("safety_zone_")) {
        if (!pendingGeometry) throw new Error("missing geometry");
        const polyCoords: [number, number, number][][] = pendingGeometry.coordinates.map((ring) =>
          (ring as [number, number][]).map(([lng, lat]): [number, number, number] => [lng, lat, elevation]),
        );
        const zoneType = entityType
          .replace("safety_zone_", "")
          .toUpperCase()
          .replace("NO_FLY", "TEMPORARY_NO_FLY") as "CTR" | "RESTRICTED" | "PROHIBITED" | "TEMPORARY_NO_FLY";
        await createSafetyZone(id, {
          name: String(data.name ?? ""),
          type: zoneType,
          geometry: { type: "Polygon", coordinates: polyCoords },
          altitude_floor: data.altitude_floor as number | undefined,
          altitude_ceiling: data.altitude_ceiling as number | undefined,
          is_active: data.is_active as boolean | undefined,
        });
      } else if (entityType === "obstacle") {
        const bufferDist = (data.buffer_distance as number) ?? 5.0;
        // use pending drawn polygon or generate from circle center
        let obstacleCoords: [number, number, number][];
        if (pendingGeometry) {
          obstacleCoords = pendingGeometry.coordinates[0].map(([lng, lat]): [number, number, number] => [lng, lat, elevation]);
        } else {
          const center = (data.center as [number, number]) ?? pendingCircleCenter ?? pendingPointPosition;
          if (!center) throw new Error("missing position");
          const ring = circleToPolygon(center, Math.max(bufferDist, 1));
          obstacleCoords = ring.map(([lng, lat]): [number, number, number] => [lng, lat, elevation]);
        }
        await createObstacle(id, {
          name: String(data.name ?? ""),
          height: (data.height as number) ?? 0,
          boundary: { type: "Polygon", coordinates: [obstacleCoords] },
          buffer_distance: bufferDist,
          type: (data.type as "BUILDING" | "TOWER" | "ANTENNA" | "VEGETATION" | "OTHER") ?? "BUILDING",
        });
      } else if (entityType === "agl") {
        const pos = (data.center as [number, number]) ?? pendingPointPosition;
        if (!pos) throw new Error("missing position");
        const sid = data.surface_id as string;
        if (!sid) throw new Error("missing surface");
        await createAGL(id, sid, {
          agl_type: String(data.agl_type ?? "PAPI"),
          name: String(data.name ?? ""),
          position: { type: "Point", coordinates: [pos[0], pos[1], elevation] },
          side: data.side as "LEFT" | "RIGHT" | undefined,
          glide_slope_angle: data.glide_slope_angle as number | undefined,
          distance_from_threshold: data.distance_from_threshold as number | undefined,
        });
      } else if (entityType === "lha") {
        const pos = (data.center as [number, number]) ?? pendingPointPosition;
        if (!pos) throw new Error("missing position");
        const aglId = (data.agl_id as string) || pendingLhaParentAglId;
        if (!aglId) throw new Error("missing AGL");
        // find the surface that owns this agl
        const parentSurface = airport.surfaces.find((s) =>
          s.agls.some((a) => a.id === aglId),
        );
        if (!parentSurface) throw new Error("missing parent surface");
        await createLHA(id, parentSurface.id, aglId, {
          unit_number: (data.unit_number as number) ?? 1,
          setting_angle: (data.setting_angle as number) ?? 3.0,
          lamp_type: (data.lamp_type as "HALOGEN" | "LED") ?? "HALOGEN",
          position: { type: "Point", coordinates: [pos[0], pos[1], elevation] },
        });
      } else {
        throw new Error(`unknown entity type: ${entityType}`);
      }

      // refresh and cleanup
      handleCreationCancel();
      await fetchAirport();
    },
    [id, airport, pendingGeometry, pendingCircleCenter, pendingPointPosition, pendingLhaParentAglId, handleCreationCancel, fetchAirport],
  );

  // warn on browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    fetchAirport();
    return () => sourceDataCache.clear();
  }, [fetchAirport]);

  // sync fetched airport to context so the navbar selector shows it
  useEffect(() => {
    if (airport) {
      selectAirportRef.current(airport);
    }
  }, [airport]);

  // keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      /** handle keyboard shortcuts for drawing tools. */
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        if (measureRef.current.isComplete) {
          measureRef.current.dismiss();
          return;
        }
        if (headingRef.current.isComplete) {
          headingRef.current.dismiss();
          return;
        }
        handleCreationCancel();
        setActiveTool("select");
        setSelectedFeature(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const keyMap: Record<string, () => void> = {
        s: () => handleToolChange("select"),
        p: () => handleToolChange("pan"),
        m: () => handleToolChange("measurement"),
        h: () => handleToolChange("heading"),
        g: () => handleToolChange("drawPolygon"),
        c: () => handleToolChange("drawCircle"),
        e: () => handleToolChange("drawRectangle"),
        t: () => handleToolChange("placePoint"),
        z: () => handleToolChange("zoom"),
        r: () => handleToolChange("zoomReset"),
      };

      const action = keyMap[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        action();
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedFeature && activeTool === "select") {
          // delete is handled by EditableFeatureInfo's delete button
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToolChange, undo, redo, selectedFeature, activeTool, handleCreationCancel]);

  const handleInfraPointDrag = useCallback(
    (featureType: "agl" | "lha", featureId: string, newPosition: [number, number, number]) => {
      /** handle agl/lha point drag - mark dirty with new position. */
      markDirty(featureType, featureId, "update", {
        position: { type: "Point", coordinates: newPosition },
      });
    },
    [markDirty],
  );

  const handleFeatureClick = useCallback((feature: MapFeature | null) => {
    /** set selected feature when clicked on map or list panel - skip during drawing. */
    if (isDrawingActive) return;
    setSelectedFeature(feature);
  }, [isDrawingActive]);

  const handleLayerChange = useCallback((layers: MapLayerConfig) => {
    /** sync layer config from map component. */
    setLayerConfig(layers);
  }, []);

  const handleFeatureUpdate = useCallback(
    (data: Record<string, unknown>) => {
      /** handle editable feature info field change. */
      if (!selectedFeature) return;
      markDirty(selectedFeature.type, selectedFeature.data.id, "update", data);
    },
    [selectedFeature, markDirty],
  );

  const handleAirportUpdate = useCallback(
    (data: Record<string, unknown>) => {
      /** track airport-level field changes. */
      if (!id) return;
      markDirty("airport", id, "update", data);
    },
    [id, markDirty],
  );

  const handleStay = useCallback(() => {
    /** cancel navigation and stay on page. */
    setShowUnsavedDialog(false);
    setPendingNav(null);
  }, []);

  const handleDiscard = useCallback(() => {
    /** discard changes and proceed with navigation. */
    setShowUnsavedDialog(false);
    clearAll();
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [clearAll, pendingNav, navigate]);

  const handleDeleteSurface = useCallback(
    async (surfaceId: string) => {
      /** delete a surface and refresh. */
      if (!id) return;
      setDeleteError(false);
      try {
        await deleteSurface(id, surfaceId);
        await fetchAirport();
      } catch {
        setDeleteError(true);
      }
    },
    [id, fetchAirport],
  );

  const handleDeleteObstacle = useCallback(
    async (obstacleId: string) => {
      /** delete an obstacle and refresh. */
      if (!id) return;
      setDeleteError(false);
      try {
        await deleteObstacle(id, obstacleId);
        await fetchAirport();
      } catch {
        setDeleteError(true);
      }
    },
    [id, fetchAirport],
  );

  const handleDeleteSafetyZone = useCallback(
    async (zoneId: string) => {
      /** delete a safety zone and refresh. */
      if (!id) return;
      setDeleteError(false);
      try {
        await deleteSafetyZone(id, zoneId);
        await fetchAirport();
      } catch {
        setDeleteError(true);
      }
    },
    [id, fetchAirport],
  );

  const handleDeleteAgl = useCallback(
    async (aglId: string) => {
      /** delete an agl system and refresh. */
      if (!id || !airport) return;
      const surface = airport.surfaces.find((s) =>
        s.agls.some((a) => a.id === aglId),
      );
      if (!surface) return;
      setDeleteError(false);
      try {
        await deleteAGL(id, surface.id, aglId);
        await fetchAirport();
      } catch {
        setDeleteError(true);
      }
    },
    [id, airport, fetchAirport],
  );

  const handleFeatureDelete = useCallback(
    async (featureType: string, featureId: string) => {
      /** dispatch delete by feature type from the feature info panel. */
      switch (featureType) {
        case "surface":
          await handleDeleteSurface(featureId);
          break;
        case "obstacle":
          await handleDeleteObstacle(featureId);
          break;
        case "safety_zone":
          await handleDeleteSafetyZone(featureId);
          break;
        case "agl":
          await handleDeleteAgl(featureId);
          break;
      }
      setSelectedFeature(null);
    },
    [handleDeleteSurface, handleDeleteObstacle, handleDeleteSafetyZone, handleDeleteAgl],
  );

  const handleZoomTo = useCallback((percent: number) => {
    /** set zoom level from toolbar dropdown. */
    setZoomPercent(percent);
  }, []);

  const handleGeoJsonApply = useCallback(
    (geometry: GeoJSON.Geometry) => {
      /** apply geojson geometry to selected feature. */
      if (!selectedFeature) return;
      markDirty(selectedFeature.type, selectedFeature.data.id, "update", { geometry });
    },
    [selectedFeature, markDirty],
  );

  const handleSave = useCallback(async () => {
    /** persist all pending changes to the backend, preserving map viewport. */
    if (!id || !airport) return;
    setSaving(true);
    setSaveError(false);

    // capture viewport before save
    const mapInst = mapHandleRef.current?.getMap();
    const viewport = mapInst ? {
      center: mapInst.getCenter(),
      zoom: mapInst.getZoom(),
      bearing: mapInst.getBearing(),
      pitch: mapInst.getPitch(),
    } : null;

    try {
      const pending = getPendingChanges();
      await Promise.all(
        pending
          .map((change) => {
            if (change.action !== "update" || !change.data) return undefined;
            switch (change.entityType) {
              case "surface":
                return updateSurface(id, change.entityId, change.data);
              case "obstacle":
                return updateObstacle(id, change.entityId, change.data);
              case "safety_zone":
                return updateSafetyZone(id, change.entityId, change.data);
              case "agl": {
                const surface = airport.surfaces.find((s) =>
                  s.agls.some((a) => a.id === change.entityId),
                );
                if (surface) {
                  return updateAGL(id, surface.id, change.entityId, change.data);
                }
                return undefined;
              }
              case "lha": {
                const parentAgl = airport.surfaces
                  .flatMap((s) => s.agls.map((a) => ({ surface: s, agl: a })))
                  .find(({ agl }) => agl.lhas.some((l) => l.id === change.entityId));
                if (parentAgl) {
                  return updateLHA(id, parentAgl.surface.id, parentAgl.agl.id, change.entityId, change.data);
                }
                return undefined;
              }
              case "airport":
                return updateAirport(id, change.data);
              default:
                return undefined;
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== undefined),
      );
      clearAll();
      const freshAirport = await fetchAirport();

      // sync selected feature with fresh data so vertex editor uses updated geometry
      if (freshAirport && selectedFeature) {
        const ft = selectedFeature.type;
        const fid = selectedFeature.data.id;
        let freshData;
        if (ft === "surface") {
          freshData = freshAirport.surfaces.find((s) => s.id === fid);
        } else if (ft === "obstacle") {
          freshData = freshAirport.obstacles.find((o) => o.id === fid);
        } else if (ft === "safety_zone") {
          freshData = freshAirport.safety_zones.find((z) => z.id === fid);
        } else if (ft === "agl") {
          freshData = freshAirport.surfaces.flatMap((s) => s.agls).find((a) => a.id === fid);
        } else if (ft === "lha") {
          freshData = freshAirport.surfaces.flatMap((s) => s.agls).flatMap((a) => a.lhas).find((l) => l.id === fid);
        }
        if (freshData) {
          setSelectedFeature({ type: ft, data: freshData } as MapFeature);
        } else {
          setSelectedFeature(null);
        }
      }

      // restore viewport after re-render
      if (viewport && mapInst) {
        requestAnimationFrame(() => {
          mapInst.jumpTo(viewport);
        });
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [id, airport, getPendingChanges, clearAll, fetchAirport, selectedFeature]);

  // pre-compute geometry-derived values for the creation form
  const prefilledGeometry = useMemo(() => {
    /** derive width, length, heading, area from pending geometry for form pre-fill. */
    if (!pendingGeometry) return {};
    const ring = pendingGeometry.coordinates[0] as [number, number][];
    const pts = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
      ? ring.slice(0, -1) : ring;

    let width: number | undefined;
    let length: number | undefined;
    let heading: number | undefined;

    if (pts.length === 4) {
      const d01 = haversineDistance(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      const d12 = haversineDistance(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
      if (d01 >= d12) {
        length = d01;
        width = (d12 + haversineDistance(pts[3][0], pts[3][1], pts[0][0], pts[0][1])) / 2;
      } else {
        length = d12;
        width = (d01 + haversineDistance(pts[2][0], pts[2][1], pts[3][0], pts[3][1])) / 2;
      }
    }

    // heading from centerline - use proper geographic bearing
    const centerline = extractCenterline(ring);
    if (centerline.length >= 2) {
      heading = computeBearing(centerline[0][0], centerline[0][1], centerline[1][0], centerline[1][1]);
    }

    // area via shoelace on projected coordinates
    let area: number | undefined;
    if (pts.length >= 3) {
      const refLat = pts[0][1];
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
      const projected = pts.map((p) => [
        (p[0] - pts[0][0]) * mPerDegLng,
        (p[1] - pts[0][1]) * mPerDegLat,
      ]);
      let sum = 0;
      for (let i = 0; i < projected.length; i++) {
        const j = (i + 1) % projected.length;
        sum += projected[i][0] * projected[j][1] - projected[j][0] * projected[i][1];
      }
      area = Math.abs(sum) / 2;
    }

    // for circles, use pi * r^2
    if (pendingGeometryType === "circle" && pendingCircleRadius != null) {
      area = Math.PI * pendingCircleRadius * pendingCircleRadius;
    }

    return { width, length, heading, area };
  }, [pendingGeometry, pendingGeometryType, pendingCircleRadius]);

  const surfaces = useMemo(() => airport?.surfaces ?? [], [airport]);
  const obstacles = useMemo(() => airport?.obstacles ?? [], [airport]);
  const safetyZones = useMemo(() => airport?.safety_zones ?? [], [airport]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
      </div>
    );
  }

  if (error || !airport) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-tv-bg gap-3">
        <p className="text-sm text-tv-error">{t("common.error")}</p>
        <button
          onClick={fetchAirport}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" data-testid="airport-edit-page">
      {/* map */}
      <div className="w-full h-full px-4 py-3">
        <AirportMap
          ref={mapHandleRef}
          airport={airport}
          interactive={true}
          showLayerPanel={true}
          showLegend={false}
          showPoiInfo={false}
          showWaypointList={false}
          showHelpPanel={false}
          showZoomControls={false}
          showCompass={false}
          terrainMode={terrainMode}
          onTerrainChange={setTerrainMode}
          onFeatureClick={handleFeatureClick}
          onInfraPointDrag={handleInfraPointDrag}
          onLayerChange={handleLayerChange}
          focusFeature={selectedFeature}
          pendingGeometry={pendingGeometry}
          pendingPointPosition={pendingPointPosition}
          is3D={is3D}
          onToggle3D={setIs3D}
          activeTool={mapTool}
          onMapClick={mapTool === MapTool.MEASURE || mapTool === MapTool.HEADING ? handleMapClick : undefined}
          measureData={{
            points: measure.pointsGeoJSON,
            lines: measure.linesGeoJSON,
            labels: measure.labelsGeoJSON,
          }}
          onMeasureClear={measure.clear}
          onMeasureFinish={measure.finishDrawing}
          onMeasureMouseMove={measure.setCursor}
          isMeasureDrawing={measure.isDrawing}
          headingData={{
            point: heading.pointGeoJSON,
            line: heading.lineGeoJSON,
            label: heading.labelGeoJSON,
          }}
          onHeadingClear={heading.clear}
          headingOrigin={heading.origin}
          isHeadingDrawing={heading.isDrawing}
          zoomPercent={zoomPercent}
          onZoomChange={setZoomPercent}
          onBearingChange={setBearing}
          bearingResetKey={bearingResetKey}
          leftPanelChildren={
            <div className="flex flex-col gap-2">
              {/* infrastructure crud panels */}
              <InfrastructureListPanel
                title={t("airport.groundSurfaces")}
                items={surfaces}
                getId={(s) => s.id}
                getName={(s) => s.identifier}
                onEdit={(s) => handleFeatureClick({ type: "surface", data: s })}
                onDelete={handleDeleteSurface}
                addLabel={t("coordinator.detail.addSurface")}
                onAdd={() => setActiveTool("drawPolygon")}
                getDeleteWarnings={(s) => {
                  if (s.agls.length === 0) return [];
                  return s.agls.map((a) =>
                    t("coordinator.detail.surfaceHasAgl", { name: a.name }),
                  );
                }}
                renderItem={(s) => (
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-tv-text-muted" viewBox="0 0 10 10">
                      {s.surface_type === "RUNWAY" ? (
                        <>
                          <rect x="1" y="0" width="8" height="10" rx="1" fill="currentColor" />
                          <line x1="5" y1="1" x2="5" y2="9" stroke="white" strokeWidth="0.8" strokeDasharray="1.5 1" />
                        </>
                      ) : (
                        <>
                          <rect x="1" y="0" width="8" height="10" rx="1" fill="#c8a83c" />
                          <line x1="5" y1="1" x2="5" y2="9" stroke="#1a1a1a" strokeWidth="0.7" strokeDasharray="1.5 1" />
                        </>
                      )}
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-tv-text-primary truncate">
                          {s.surface_type === "RUNWAY" ? "RWY" : "TWY"} {s.identifier}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                          style={{
                            borderColor: s.surface_type === "RUNWAY" ? "var(--tv-text-muted)" : "var(--tv-accent)",
                            color: s.surface_type === "RUNWAY" ? "var(--tv-text-muted)" : "var(--tv-accent)",
                          }}
                        >
                          {s.surface_type === "RUNWAY" ? t("airport.runway") : t("airport.taxiway")}
                        </span>
                      </div>
                      {s.length != null && s.width != null && (
                        <p className="text-[10px] text-tv-text-secondary mt-0.5">
                          {s.length}m × {s.width}m
                        </p>
                      )}
                    </div>
                  </div>
                )}
              />

              <InfrastructureListPanel
                title={t("airport.obstacles")}
                items={obstacles}
                getId={(o) => o.id}
                getName={(o) => o.name}
                onEdit={(o) => handleFeatureClick({ type: "obstacle", data: o })}
                onDelete={handleDeleteObstacle}
                addLabel={t("coordinator.detail.addObstacle")}
                onAdd={() => setActiveTool("drawCircle")}
                renderItem={(o) => {
                  const color = OBSTACLE_COLORS[o.type] ?? "#6b6b6b";
                  return (
                    <div className="flex items-center gap-2">
                      <ObstacleTypeIcon type={o.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-tv-text-primary truncate">{o.name}</span>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                            style={{ borderColor: color, color }}
                          >
                            {o.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-tv-text-secondary mt-0.5">
                          {t("dashboard.poiHeight")}: {o.height}m
                        </p>
                      </div>
                    </div>
                  );
                }}
              />

              <InfrastructureListPanel
                title={t("airport.safetyZones")}
                items={safetyZones}
                getId={(z) => z.id}
                getName={(z) => z.name}
                onEdit={(z) => handleFeatureClick({ type: "safety_zone", data: z })}
                onDelete={handleDeleteSafetyZone}
                addLabel={t("coordinator.detail.addSafetyZone")}
                onAdd={() => setActiveTool("drawPolygon")}
                renderItem={(z) => {
                  const color = ZONE_COLORS[z.type] ?? "#6b6b6b";
                  return (
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-tv-text-primary truncate">{z.name}</span>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                            style={{ borderColor: color, color }}
                          >
                            {t(`airport.zoneType.${z.type}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {z.altitude_floor != null && z.altitude_ceiling != null && (
                            <span className="text-[10px] text-tv-text-secondary">
                              {z.altitude_floor}m - {z.altitude_ceiling}m
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px]">
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: z.is_active ? "var(--tv-success)" : "#6b6b6b" }}
                            />
                            <span className="text-tv-text-muted">
                              {z.is_active ? t("airport.active") : t("airport.inactive")}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              <CoordinatorAGLPanel
                surfaces={surfaces}
                onItemClick={handleFeatureClick}
                onDeleteAgl={handleDeleteAgl}
              />
            </div>
          }
        >
          {/* top-center: drawing toolbar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            <MapDrawingToolbar
              activeTool={activeTool}
              onToolChange={handleToolChange}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onGeoJsonEditor={() => setShowGeoJsonEditor(true)}
              zoomPercent={zoomPercent}
              onZoomTo={handleZoomTo}
              onZoomReset={() => setActiveTool("zoomReset")}
              isDirty={isDirty}
              saving={saving}
              onSave={handleSave}
              saveLabel={saving ? t("coordinator.detail.saving") : t("coordinator.detail.save")}
              bearing={bearing}
              onBearingReset={() => setBearingResetKey((k) => k + 1)}
            />
          </div>

          {/* right side: legend + feature info */}
          <div
            className="absolute top-3 right-3 bottom-[60px] z-10 w-56 flex flex-col gap-2 overflow-y-auto pr-1"
            style={{ scrollbarGutter: "stable" }}
          >
            <LegendPanel
              layers={layerConfig}
              className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
            />
            <AirportInfoPanel
              airport={airport}
              onUpdate={handleAirportUpdate}
            />
            <TerrainSettingsCard
              airport={airport}
              onUpdate={() => fetchAirport()}
            />
            {/* creation form or feature editor */}
            {(pendingGeometry || pendingPointPosition) ? (
              <CreationForm
                geometryType={pendingGeometryType}
                circleRadius={pendingCircleRadius}
                circleCenter={pendingCircleCenter}
                pointPosition={pendingPointPosition}
                surfaces={surfaces}
                onCancel={handleCreationCancel}
                onCreate={handleCreate}
                prefilledWidth={prefilledGeometry.width}
                prefilledLength={prefilledGeometry.length}
                prefilledHeading={prefilledGeometry.heading}
                prefilledArea={prefilledGeometry.area}
              />
            ) : measure.isComplete ? (
              <MeasureInfoCard
                totalDistance={measure.totalDistance}
                segmentCount={measure.segments.length}
                onClose={measure.dismiss}
              />
            ) : heading.isComplete && heading.bearing !== null ? (
              <HeadingInfoCard
                bearing={heading.bearing}
                onClose={heading.dismiss}
              />
            ) : selectedFeature && selectedFeature.type !== "waypoint" ? (
              <EditableFeatureInfo
                feature={selectedFeature}
                onUpdate={handleFeatureUpdate}
                onClose={() => setSelectedFeature(null)}
                surfaces={surfaces}
                onDelete={handleFeatureDelete}
                deleteWarnings={
                  selectedFeature.type === "surface"
                    ? (selectedFeature.data as { agls?: { name: string }[] }).agls
                        ?.map((a) => t("coordinator.detail.surfaceHasAgl", { name: a.name }))
                    : undefined
                }
                onAddLha={selectedFeature.type === "agl" ? handleAddLha : undefined}
              />
            ) : null}
          </div>

          {/* bottom-left: coordinator help panel */}
          <div className="absolute bottom-3 left-3 z-10">
            <CoordinatorMapHelpPanel />
          </div>

          {/* bottom-right: view toggles + error messages */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
            {(saveError || deleteError) && (
              <p className="text-xs text-tv-error">
                {saveError ? t("coordinator.detail.saveError") : t("coordinator.detail.deleteError")}
              </p>
            )}

            {/* 2D/3D toggle */}
            <div className="flex items-center rounded-full border border-tv-border bg-tv-bg px-1 py-1">
              <button
                onClick={() => setIs3D(false)}
                title={t("map.tools.2d")}
                className={`flex items-center justify-center rounded-full h-9 px-3 text-xs font-medium transition-colors ${
                  !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
                data-testid="toggle-2d"
              >
                2D
              </button>
              <button
                onClick={() => setIs3D(true)}
                title={t("map.tools.3d")}
                className={`flex items-center justify-center rounded-full h-9 px-3 text-xs font-medium transition-colors ${
                  is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
                data-testid="toggle-3d"
              >
                3D
              </button>
            </div>

            {/* map/satellite toggle */}
            <div className="flex items-center rounded-full border border-tv-border bg-tv-bg px-1 py-1">
              <button
                onClick={() => setTerrainMode("map")}
                className={`flex items-center justify-center rounded-full h-9 px-3 text-xs font-medium transition-colors ${
                  terrainMode === "map" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
                data-testid="toggle-map"
              >
                {t("dashboard.mapView")}
              </button>
              <button
                onClick={() => setTerrainMode("satellite")}
                className={`flex items-center justify-center rounded-full h-9 px-3 text-xs font-medium transition-colors ${
                  terrainMode === "satellite" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
                data-testid="toggle-satellite"
              >
                {t("dashboard.satelliteView")}
              </button>
            </div>
          </div>
        </AirportMap>
      </div>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onStay={handleStay}
        onDiscard={handleDiscard}
      />

      <GeoJsonEditorModal
        isOpen={showGeoJsonEditor}
        onClose={() => setShowGeoJsonEditor(false)}
        onApply={handleGeoJsonApply}
      />
    </div>
  );
}
