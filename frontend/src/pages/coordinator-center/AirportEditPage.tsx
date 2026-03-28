import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft } from "lucide-react";
import { getAirport } from "@/api/airports";
import {
  deleteSurface,
  deleteObstacle,
  deleteSafetyZone,
  deleteAGL,
} from "@/api/airports";
import type { AirportDetailResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import AirportMap from "@/components/map/AirportMap";
import LegendPanel from "@/components/map/overlays/LegendPanel";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import MapDrawingToolbar from "@/components/coordinator/MapDrawingToolbar";
import InfrastructureListPanel from "@/components/coordinator/InfrastructureListPanel";
import EditableFeatureInfo from "@/components/coordinator/EditableFeatureInfo";
import GeoJsonEditorModal from "@/components/coordinator/GeoJsonEditorModal";
import UnsavedChangesDialog from "@/components/coordinator/UnsavedChangesDialog";
import Button from "@/components/common/Button";
import useMapDrawing from "@/hooks/useMapDrawing";
import useDirtyState from "@/hooks/useDirtyState";

export default function AirportEditPage() {
  /** full airport detail editor with map, drawing tools, and infrastructure crud. */
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [airport, setAirport] = useState<AirportDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  const [layerConfig, setLayerConfig] = useState<MapLayerConfig>(DEFAULT_LAYER_CONFIG);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [showGeoJsonEditor, setShowGeoJsonEditor] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const drawing = useMapDrawing();
  const dirty = useDirtyState();

  const fetchAirport = useCallback(async () => {
    /** fetch airport detail data. */
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getAirport(id);
      setAirport(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAirport();
  }, [fetchAirport]);

  const handleFeatureClick = useCallback((feature: MapFeature | null) => {
    /** set selected feature when clicked on map or list panel. */
    setSelectedFeature(feature);
  }, []);

  const handleLayerChange = useCallback((layers: MapLayerConfig) => {
    /** sync layer config from map component. */
    setLayerConfig(layers);
  }, []);

  const handleFeatureUpdate = useCallback(
    (data: Record<string, unknown>) => {
      /** handle editable feature info field change. */
      if (!selectedFeature) return;
      dirty.markDirty(selectedFeature.type, selectedFeature.data.id, "update", data);
    },
    [selectedFeature, dirty],
  );

  const handleBack = useCallback(() => {
    /** navigate back to list, with unsaved changes check. */
    if (dirty.isDirty) {
      setPendingNavigation("/coordinator-center/airports");
      setShowUnsavedDialog(true);
    } else {
      navigate("/coordinator-center/airports");
    }
  }, [dirty.isDirty, navigate]);

  const handleDiscard = useCallback(() => {
    /** discard changes and navigate. */
    setShowUnsavedDialog(false);
    dirty.clearAll();
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  }, [dirty, navigate, pendingNavigation]);

  const handleDeleteSurface = useCallback(
    async (surfaceId: string) => {
      /** delete a surface and refresh. */
      if (!id) return;
      try {
        await deleteSurface(id, surfaceId);
        fetchAirport();
      } catch {
        // silently fail - could add error toast
      }
    },
    [id, fetchAirport],
  );

  const handleDeleteObstacle = useCallback(
    async (obstacleId: string) => {
      /** delete an obstacle and refresh. */
      if (!id) return;
      try {
        await deleteObstacle(id, obstacleId);
        fetchAirport();
      } catch {
        // silently fail
      }
    },
    [id, fetchAirport],
  );

  const handleDeleteSafetyZone = useCallback(
    async (zoneId: string) => {
      /** delete a safety zone and refresh. */
      if (!id) return;
      try {
        await deleteSafetyZone(id, zoneId);
        fetchAirport();
      } catch {
        // silently fail
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
      try {
        await deleteAGL(id, surface.id, aglId);
        fetchAirport();
      } catch {
        // silently fail
      }
    },
    [id, airport, fetchAirport],
  );

  const surfaces = useMemo(() => airport?.surfaces ?? [], [airport]);
  const obstacles = useMemo(() => airport?.obstacles ?? [], [airport]);
  const safetyZones = useMemo(() => airport?.safety_zones ?? [], [airport]);
  const allAgls = useMemo(
    () => surfaces.flatMap((s) => s.agls),
    [surfaces],
  );

  function handleGeoJsonApply(geometry: GeoJSON.Geometry) {
    /** add geojson geometry as a drawn feature. */
    drawing.addFeature({
      id: crypto.randomUUID(),
      geometry,
      properties: {},
    });
  }

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
      {/* back button */}
      <div className="absolute top-3 left-3 z-20">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium bg-tv-surface border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
          data-testid="back-to-list"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("coordinator.detail.backToList")}
        </button>
      </div>

      {/* drawing toolbar - top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <MapDrawingToolbar
          activeTool={drawing.activeTool}
          onToolChange={drawing.setActiveTool}
          canUndo={drawing.canUndo}
          canRedo={drawing.canRedo}
          onUndo={drawing.undo}
          onRedo={drawing.redo}
          onGeoJsonEditor={() => setShowGeoJsonEditor(true)}
        />
      </div>

      {/* map */}
      <div className="w-full h-full px-4 py-3">
        <AirportMap
          airport={airport}
          interactive={true}
          showLayerPanel={true}
          showLegend={false}
          showPoiInfo={false}
          showWaypointList={false}
          terrainMode={terrainMode}
          onTerrainChange={setTerrainMode}
          onFeatureClick={handleFeatureClick}
          onLayerChange={handleLayerChange}
          focusFeature={selectedFeature}
          is3D={is3D}
          onToggle3D={setIs3D}
          leftPanelChildren={
            <div className="flex flex-col gap-2 mt-16">
              {/* infrastructure crud panels */}
              <InfrastructureListPanel
                title={t("airport.groundSurfaces")}
                items={surfaces}
                getId={(s) => s.id}
                getName={(s) => s.identifier}
                onAdd={() => drawing.setActiveTool("drawPolygon")}
                onEdit={(s) => handleFeatureClick({ type: "surface", data: s })}
                onDelete={handleDeleteSurface}
                addLabel={t("coordinator.detail.addSurface")}
                renderItem={(s) => (
                  <div>
                    <span className="text-xs font-medium text-tv-text-primary">
                      {s.surface_type === "RUNWAY" ? "RWY" : "TWY"} {s.identifier}
                    </span>
                    {s.length != null && s.width != null && (
                      <p className="text-[10px] text-tv-text-secondary">
                        {s.length}m × {s.width}m
                      </p>
                    )}
                  </div>
                )}
              />

              <InfrastructureListPanel
                title={t("airport.obstacles")}
                items={obstacles}
                getId={(o) => o.id}
                getName={(o) => o.name}
                onAdd={() => drawing.setActiveTool("placePoint")}
                onEdit={(o) => handleFeatureClick({ type: "obstacle", data: o })}
                onDelete={handleDeleteObstacle}
                addLabel={t("coordinator.detail.addObstacle")}
                renderItem={(o) => (
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-tv-text-primary">{o.name}</span>
                      <span className="text-[10px] text-tv-text-muted">{o.type}</span>
                    </div>
                    <p className="text-[10px] text-tv-text-secondary">{o.height}m</p>
                  </div>
                )}
              />

              <InfrastructureListPanel
                title={t("airport.safetyZones")}
                items={safetyZones}
                getId={(z) => z.id}
                getName={(z) => z.name}
                onAdd={() => drawing.setActiveTool("drawPolygon")}
                onEdit={(z) => handleFeatureClick({ type: "safety_zone", data: z })}
                onDelete={handleDeleteSafetyZone}
                addLabel={t("coordinator.detail.addSafetyZone")}
                renderItem={(z) => (
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-tv-text-primary">{z.name}</span>
                      <span className="text-[10px] text-tv-text-muted">{t(`airport.zoneType.${z.type}`)}</span>
                    </div>
                    {z.altitude_floor != null && z.altitude_ceiling != null && (
                      <p className="text-[10px] text-tv-text-secondary">
                        {z.altitude_floor}m - {z.altitude_ceiling}m
                      </p>
                    )}
                  </div>
                )}
              />

              <InfrastructureListPanel
                title={t("airport.aglSystems")}
                items={allAgls}
                getId={(a) => a.id}
                getName={(a) => a.name}
                onAdd={() => drawing.setActiveTool("placePoint")}
                onEdit={(a) => handleFeatureClick({ type: "agl", data: a })}
                onDelete={handleDeleteAgl}
                addLabel={t("coordinator.detail.addAgl")}
                renderItem={(a) => (
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-tv-text-primary">{a.name}</span>
                      <span className="text-[10px] text-tv-text-muted">{a.agl_type}</span>
                    </div>
                    <p className="text-[10px] text-tv-text-secondary">
                      {a.lhas.length} {t("airport.units")}
                    </p>
                  </div>
                )}
              />

              {/* editable feature info */}
              {selectedFeature && selectedFeature.type !== "waypoint" && (
                <EditableFeatureInfo
                  feature={selectedFeature}
                  onUpdate={handleFeatureUpdate}
                  onClose={() => setSelectedFeature(null)}
                />
              )}
            </div>
          }
        >
          {/* right side: legend panel */}
          <div
            className="absolute top-3 right-3 bottom-[60px] z-10 w-56 flex flex-col gap-2 overflow-y-auto pr-1"
            style={{ scrollbarGutter: "stable" }}
          >
            <LegendPanel
              layers={layerConfig}
              className="w-full rounded-2xl border border-tv-border bg-tv-bg flex-shrink-0"
            />
          </div>

          {/* bottom bar */}
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between">
            {/* left: 2D/3D + terrain */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-tv-border bg-tv-surface p-1">
                <button
                  onClick={() => setIs3D(false)}
                  title={t("map.toggle2d")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !is3D
                      ? "bg-tv-accent text-tv-accent-text"
                      : "text-tv-text-secondary hover:text-tv-text-primary"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => setIs3D(true)}
                  title={t("map.toggle3d")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    is3D
                      ? "bg-tv-accent text-tv-accent-text"
                      : "text-tv-text-secondary hover:text-tv-text-primary"
                  }`}
                >
                  3D
                </button>
              </div>
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
            </div>

            {/* right: save button */}
            <Button
              disabled={!dirty.isDirty}
              onClick={() => {
                dirty.clearAll();
                fetchAirport();
              }}
              data-testid="save-button"
            >
              {t("coordinator.detail.save")}
            </Button>
          </div>
        </AirportMap>
      </div>

      {/* modals */}
      <GeoJsonEditorModal
        isOpen={showGeoJsonEditor}
        onClose={() => setShowGeoJsonEditor(false)}
        onApply={handleGeoJsonApply}
      />

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onStay={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
