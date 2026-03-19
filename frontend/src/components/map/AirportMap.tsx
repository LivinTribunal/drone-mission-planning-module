import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { AirportMapProps, MapFeature, MapLayerConfig } from "@/types/map";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";
import {
  addSurfaceLayers,
  RUNWAY_LAYER,
  TAXIWAY_LAYER,
} from "./layers/surfaceLayers";
import {
  addObstacleLayers,
  OBSTACLE_POINT_LAYER,
  OBSTACLE_RADIUS_LAYER,
} from "./layers/obstacleLayers";
import {
  addSafetyZoneLayers,
  SAFETY_ZONE_FILL_LAYER,
  SAFETY_ZONE_BORDER_LAYER,
} from "./layers/safetyZoneLayers";
import {
  addAglLayers,
  AGL_POINT_LAYER,
  AGL_LABEL_LAYER,
  LHA_POINT_LAYER,
} from "./layers/aglLayers";
import LayerPanel from "./overlays/LayerPanel";
import LegendPanel from "./overlays/LegendPanel";
import PoiInfoPanel from "./overlays/PoiInfoPanel";
import TerrainToggle from "./overlays/TerrainToggle";
import MapHelpPanel from "./overlays/MapHelpPanel";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function makeSatelliteStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [ESRI_TILES],
        tileSize: 256,
        maxzoom: 18,
      },
    },
    layers: [{ id: "satellite-base", type: "raster", source: "satellite" }],
  };
}

function makeMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM_TILES],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [{ id: "osm-base", type: "raster", source: "osm" }],
  };
}

// map layer id groups keyed by layer config key
const layerGroupMap: Record<keyof MapLayerConfig, string[]> = {
  runways: [RUNWAY_LAYER],
  taxiways: [TAXIWAY_LAYER],
  obstacles: [OBSTACLE_POINT_LAYER, OBSTACLE_RADIUS_LAYER],
  safetyZones: [SAFETY_ZONE_FILL_LAYER, SAFETY_ZONE_BORDER_LAYER],
  aglSystems: [AGL_POINT_LAYER, AGL_LABEL_LAYER, LHA_POINT_LAYER],
};

// all interactive layer ids for click handling
const INTERACTIVE_LAYERS = [
  RUNWAY_LAYER,
  TAXIWAY_LAYER,
  OBSTACLE_POINT_LAYER,
  SAFETY_ZONE_FILL_LAYER,
  AGL_POINT_LAYER,
  LHA_POINT_LAYER,
];

export default function AirportMap({
  airport,
  layers: layersProp,
  interactive = true,
  showLayerPanel = true,
  showLegend = true,
  showPoiInfo = true,
  showTerrainToggle = true,
  onFeatureClick,
  children,
}: AirportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersAddedRef = useRef(false);

  const [layerConfig, setLayerConfig] = useState<MapLayerConfig>({
    ...DEFAULT_LAYER_CONFIG,
    ...layersProp,
  });
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">(
    "satellite",
  );
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(
    null,
  );

  // initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    const [lon, lat] = airport.location.coordinates;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeSatelliteStyle(),
      center: [lon, lat],
      zoom: 14.5,
      interactive,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, [airport.id, interactive]); // only re-init on airport id change

  // add infrastructure layers once map + airport data are ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      if (!map || layersAddedRef.current) return;
      layersAddedRef.current = true;

      addSafetyZoneLayers(map, airport.safety_zones);
      addSurfaceLayers(map, airport.surfaces);
      addObstacleLayers(map, airport.obstacles);
      addAglLayers(map, airport.surfaces);
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.on("load", addLayers);
    }

    return () => {
      map.off("load", addLayers);
    };
  }, [airport]);

  // click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    function handleClick(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: INTERACTIVE_LAYERS.filter((id) => {
          try {
            return map.getLayer(id);
          } catch {
            return false;
          }
        }),
      });

      if (!features.length) {
        setSelectedFeature(null);
        return;
      }

      const f = features[0];
      const props = f.properties;
      if (!props) return;

      const entityType = props.entityType as string;
      let mapFeature: MapFeature | null = null;

      // find the entity data from airport detail
      if (entityType === "surface") {
        const surface = airport.surfaces.find((s) => s.id === props.id);
        if (surface) mapFeature = { type: "surface", data: surface };
      } else if (entityType === "obstacle") {
        const obstacle = airport.obstacles.find((o) => o.id === props.id);
        if (obstacle) mapFeature = { type: "obstacle", data: obstacle };
      } else if (entityType === "safety_zone") {
        const zone = airport.safety_zones.find((z) => z.id === props.id);
        if (zone) mapFeature = { type: "safety_zone", data: zone };
      } else if (entityType === "agl") {
        const agl = airport.surfaces
          .flatMap((s) => s.agls)
          .find((a) => a.id === props.id);
        if (agl) mapFeature = { type: "agl", data: agl };
      } else if (entityType === "lha") {
        const lha = airport.surfaces
          .flatMap((s) => s.agls)
          .flatMap((a) => a.lhas)
          .find((l) => l.id === props.id);
        if (lha) mapFeature = { type: "lha", data: lha };
      }

      if (mapFeature) {
        setSelectedFeature(mapFeature);
        onFeatureClick?.(mapFeature);
      }
    }

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [airport, interactive, onFeatureClick]);

  // sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function syncVisibility() {
      if (!map) return;
      for (const [key, layerIds] of Object.entries(layerGroupMap)) {
        const visible = layerConfig[key as keyof MapLayerConfig];
        for (const layerId of layerIds) {
          try {
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(
                layerId,
                "visibility",
                visible ? "visible" : "none",
              );
            }
          } catch {
            // layer may not exist yet
          }
        }
      }
    }

    if (map.isStyleLoaded()) {
      syncVisibility();
    } else {
      map.on("load", syncVisibility);
    }

    return () => {
      map.off("load", syncVisibility);
    };
  }, [layerConfig]);

  // terrain mode switch
  const handleTerrainChange = useCallback(
    (mode: "map" | "satellite") => {
      setTerrainMode(mode);
      const map = mapRef.current;
      if (!map) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();

      layersAddedRef.current = false;

      map.setStyle(mode === "satellite" ? makeSatelliteStyle() : makeMapStyle());

      // wait for new style to be ready before re-adding layers
      const mapInstance = map;
      function onData() {
        if (!mapRef.current) {
          mapInstance.off("data", onData);
          return;
        }
        if (!mapInstance.isStyleLoaded()) return;
        mapInstance.off("data", onData);

        mapInstance.setCenter(center);
        mapInstance.setZoom(zoom);
        mapInstance.setBearing(bearing);
        mapInstance.setPitch(pitch);

        if (layersAddedRef.current) return;
        layersAddedRef.current = true;
        addSafetyZoneLayers(mapInstance, airport.safety_zones);
        addSurfaceLayers(mapInstance, airport.surfaces);
        addObstacleLayers(mapInstance, airport.obstacles);
        addAglLayers(mapInstance, airport.surfaces);

        for (const [key, layerIds] of Object.entries(layerGroupMap)) {
          const visible = layerConfig[key as keyof MapLayerConfig];
          for (const layerId of layerIds) {
            try {
              if (mapInstance.getLayer(layerId)) {
                mapInstance.setLayoutProperty(
                  layerId,
                  "visibility",
                  visible ? "visible" : "none",
                );
              }
            } catch {
              // layer may not exist yet
            }
          }
        }
      }
      mapInstance.on("data", onData);
    },
    [airport, layerConfig],
  );

  const handleLayerToggle = useCallback((key: keyof MapLayerConfig) => {
    setLayerConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // wasd / arrow key navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    const PAN_STEP = 80;
    const keyMap: Record<string, [number, number]> = {
      w: [0, -PAN_STEP],
      a: [-PAN_STEP, 0],
      s: [0, PAN_STEP],
      d: [PAN_STEP, 0],
      ArrowUp: [0, -PAN_STEP],
      ArrowLeft: [-PAN_STEP, 0],
      ArrowDown: [0, PAN_STEP],
      ArrowRight: [PAN_STEP, 0],
    };

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const delta = keyMap[e.key];
      if (delta && map) {
        e.preventDefault();
        map.panBy(delta, { duration: 200 });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [interactive]);

  return (
    <div
      className="relative h-full w-full rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--tv-map-bg)" }}
      data-testid="airport-map"
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* top-left: layers panel + poi info */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 w-52">
        {showLayerPanel && (
          <LayerPanel layers={layerConfig} onToggle={handleLayerToggle} />
        )}
        {showPoiInfo && (
          <PoiInfoPanel
            feature={selectedFeature}
            onClose={() => setSelectedFeature(null)}
          />
        )}
      </div>

      {/* top-right: legend */}
      {showLegend && <LegendPanel />}

      {/* bottom-left: map help */}
      <div className="absolute bottom-3 left-3 z-10">
        <MapHelpPanel />
      </div>

      {/* bottom-right: terrain toggle sits at the very bottom */}
      {showTerrainToggle && (
        <TerrainToggle mode={terrainMode} onToggle={handleTerrainChange} />
      )}

      {children}
    </div>
  );
}
