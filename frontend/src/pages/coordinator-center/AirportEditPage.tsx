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
  updateAirport,
} from "@/api/airports";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportDetailResponse } from "@/types/airport";
import type { ObstacleType } from "@/types/enums";
import type { MapFeature, MapLayerConfig } from "@/types/map";

const OBSTACLE_COLORS: Record<ObstacleType, string> = {
  BUILDING: "#e54545",
  TOWER: "#9b59b6",
  ANTENNA: "#e5a545",
  VEGETATION: "#3bbb3b",
  OTHER: "#6b6b6b",
};

const ZONE_COLORS: Record<string, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import AirportMap from "@/components/map/AirportMap";
import LegendPanel from "@/components/map/overlays/LegendPanel";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import InfrastructureListPanel from "@/components/coordinator/InfrastructureListPanel";
import CoordinatorAGLPanel from "@/components/coordinator/CoordinatorAGLPanel";
import AirportInfoPanel from "@/components/coordinator/AirportInfoPanel";
import EditableFeatureInfo from "@/components/coordinator/EditableFeatureInfo";
import UnsavedChangesDialog from "@/components/coordinator/UnsavedChangesDialog";
import Button from "@/components/common/Button";
import useDirtyState from "@/hooks/useDirtyState";

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

  const dirty = useDirtyState();
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // warn on browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.isDirty]);

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

  // sync fetched airport to context so the navbar selector shows it
  useEffect(() => {
    if (airport) {
      selectAirportRef.current(airport);
    }
  }, [airport]);

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

  const handleAirportUpdate = useCallback(
    (data: Record<string, unknown>) => {
      /** track airport-level field changes. */
      if (!id) return;
      dirty.markDirty("airport", id, "update", data);
    },
    [id, dirty],
  );

  const handleStay = useCallback(() => {
    /** cancel navigation and stay on page. */
    setShowUnsavedDialog(false);
    setPendingNav(null);
  }, []);

  const handleDiscard = useCallback(() => {
    /** discard changes and proceed with navigation. */
    setShowUnsavedDialog(false);
    dirty.clearAll();
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [dirty, pendingNav, navigate]);

  const handleDeleteSurface = useCallback(
    async (surfaceId: string) => {
      /** delete a surface and refresh. */
      if (!id) return;
      try {
        await deleteSurface(id, surfaceId);
        await fetchAirport();
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
        await fetchAirport();
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
        await fetchAirport();
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
        await fetchAirport();
      } catch {
        // silently fail
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
                        <rect x="0" y="2" width="10" height="6" rx="1" fill="currentColor" />
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
                renderItem={(o) => {
                  const color = OBSTACLE_COLORS[o.type] ?? "#6b6b6b";
                  return (
                    <div className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
                        <polygon points="5,1 9,9 1,9" fill={color} />
                      </svg>
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
                              style={{ backgroundColor: z.is_active ? "#3bbb3b" : "#6b6b6b" }}
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
            {selectedFeature && selectedFeature.type !== "waypoint" && (
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
              />
            )}
          </div>

          {/* bottom bar */}
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-end">
            <div className="flex items-center gap-2">
              {/* 2D/3D toggle */}
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

              {/* terrain toggle */}
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />

              {/* save */}
              {saveError && (
                <p className="text-xs text-tv-error">{t("coordinator.detail.saveError")}</p>
              )}
              <Button
                disabled={!dirty.isDirty || saving}
                onClick={async () => {
                  if (!id || !airport) return;
                  setSaving(true);
                  setSaveError(false);
                  try {
                    const pending = dirty.getPendingChanges();
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
                            case "airport":
                              return updateAirport(id, change.data);
                            default:
                              return undefined;
                          }
                        })
                        .filter((p): p is NonNullable<typeof p> => p !== undefined),
                    );
                    dirty.clearAll();
                    await fetchAirport();
                  } catch {
                    setSaveError(true);
                  } finally {
                    setSaving(false);
                  }
                }}
                data-testid="save-button"
              >
                {saving ? t("coordinator.detail.saving") : t("coordinator.detail.save")}
              </Button>
            </div>
          </div>
        </AirportMap>
      </div>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onStay={handleStay}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
