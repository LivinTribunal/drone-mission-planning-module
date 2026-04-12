import { useState, type ReactNode } from "react";
import type { AirportDetailResponse } from "@/types/airport";
import type { MapFeature } from "@/types/map";
import AirportMap from "./AirportMap";
import PoiInfoPanel from "./overlays/PoiInfoPanel";
import TerrainToggle from "./overlays/TerrainToggle";

interface MapViewerProps {
  airport: AirportDetailResponse;
  leftPanelChildren?: ReactNode;
  children?: ReactNode;
}

export default function MapViewer({
  airport,
  leftPanelChildren,
  children,
}: MapViewerProps) {
  /** interactive airport infrastructure viewer with layer panel and feature selection. */
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);
  return (
    <AirportMap
      airport={airport}
      interactive
      helpVariant="preview"
      showLayerPanel
      showLegend={false}
      showPoiInfo={false}
      showWaypointList={false}
      terrainMode={terrainMode}
      onTerrainChange={setTerrainMode}
      onFeatureClick={setSelectedFeature}
      focusFeature={selectedFeature}
      is3D={is3D}
      onToggle3D={setIs3D}
      leftPanelChildren={
        <>
          {leftPanelChildren}
          {selectedFeature && (
            <PoiInfoPanel
              feature={selectedFeature}
              onClose={() => setSelectedFeature(null)}
            />
          )}
        </>
      }
    >
      {/* bottom-right: 2D/3D + terrain */}
      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2">
        <div className="flex rounded-full border border-tv-border bg-tv-surface p-1">
          <button
            onClick={() => setIs3D(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:text-tv-text-primary"
            }`}
          >
            2D
          </button>
          <button
            onClick={() => setIs3D(true)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary hover:text-tv-text-primary"
            }`}
          >
            3D
          </button>
        </div>
        <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
      </div>

      {children}
    </AirportMap>
  );
}
