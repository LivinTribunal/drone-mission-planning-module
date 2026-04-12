import { useState, useMemo, type ReactNode } from "react";
import type { AirportDetailResponse } from "@/types/airport";
import type { WaypointResponse, ValidationViolation } from "@/types/flightPlan";
import type { MissionStatus } from "@/types/enums";
import type { MapFeature, MapLayerConfig } from "@/types/map";
import type { PointZ } from "@/types/common";
import type { InspectionResponse } from "@/types/mission";
import AirportMap from "./AirportMap";
import PoiInfoPanel from "./overlays/PoiInfoPanel";
import TerrainToggle from "./overlays/TerrainToggle";

interface MapPreviewProps {
  airport: AirportDetailResponse;
  waypoints?: WaypointResponse[];
  missionStatus?: MissionStatus;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  inspections?: InspectionResponse[];
  layers?: Partial<MapLayerConfig>;
  simplifiedTrajectory?: boolean;
  selectedWarning?: ValidationViolation | null;
  onWarningClose?: () => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  children?: ReactNode;
}

export default function MapPreview({
  airport,
  waypoints,
  missionStatus,
  takeoffCoordinate,
  landingCoordinate,
  inspections,
  layers,
  simplifiedTrajectory,
  selectedWarning,
  onWarningClose,
  onMapClick,
  children,
}: MapPreviewProps) {
  /** read-only map preview with feature/waypoint selection (no editing tools). */
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);

  const inspectionIndexMap = useMemo(() => {
    if (!inspections) return undefined;
    const sorted = [...inspections].sort((a, b) => a.sequence_order - b.sequence_order);
    return Object.fromEntries(sorted.map((insp, i) => [insp.id, i + 1]));
  }, [inspections]);

  return (
    <AirportMap
      airport={airport}
      helpVariant="preview"
      terrainMode={terrainMode}
      onTerrainChange={setTerrainMode}
      showTerrainToggle={false}
      is3D={is3D}
      onToggle3D={setIs3D}
      waypoints={waypoints}
      selectedWaypointId={selectedWaypointId}
      onWaypointClick={setSelectedWaypointId}
      missionStatus={missionStatus}
      takeoffCoordinate={takeoffCoordinate}
      landingCoordinate={landingCoordinate}
      inspectionIndexMap={inspectionIndexMap}
      onFeatureClick={setSelectedFeature}
      focusFeature={selectedFeature}
      layers={layers}
      simplifiedTrajectory={simplifiedTrajectory}
      highlightedWaypointIds={selectedWarning?.waypoint_ids}
      highlightSeverity={selectedWarning?.severity}
      selectedWarning={selectedWarning}
      onWarningClose={onWarningClose}
      onMapClick={onMapClick}
    >
      {selectedFeature && (
        <div className="absolute top-3 right-3 z-10 w-56">
          <PoiInfoPanel
            feature={selectedFeature}
            onClose={() => setSelectedFeature(null)}
          />
        </div>
      )}

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
