import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Hand,
  ZoomIn,
  Maximize2,
  MousePointer2,
  Pentagon,
  Circle,
  Square,
  MapPin,
  Diamond,
  Move,
  Code2,
  Undo2,
  Redo2,
} from "lucide-react";

export type DrawingTool =
  | "pan"
  | "zoom"
  | "zoomReset"
  | "select"
  | "drawPolygon"
  | "drawCircle"
  | "drawRectangle"
  | "placePoint"
  | "editVertices"
  | "moveFeature"
  | "geoJsonEditor";

interface MapDrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGeoJsonEditor: () => void;
  zoomPercent: number;
  onZoomTo: (percent: number) => void;
  is3D: boolean;
  onToggle3D: (val: boolean) => void;
  terrainMode: "map" | "satellite";
  onTerrainChange: (mode: "map" | "satellite") => void;
}

interface ToolDef {
  key: DrawingTool;
  icon: React.ComponentType<{ className?: string }>;
  tooltipKey: string;
}

const ZOOM_PRESETS = [50, 75, 100, 150, 200, 300];

const navTools: ToolDef[] = [
  { key: "pan", icon: Hand, tooltipKey: "coordinator.airports.tools.pan" },
  { key: "zoom", icon: ZoomIn, tooltipKey: "coordinator.airports.tools.zoom" },
  { key: "zoomReset", icon: Maximize2, tooltipKey: "coordinator.airports.tools.zoomReset" },
  { key: "select", icon: MousePointer2, tooltipKey: "coordinator.airports.tools.select" },
];

const drawTools: ToolDef[] = [
  { key: "drawPolygon", icon: Pentagon, tooltipKey: "coordinator.airports.tools.drawPolygon" },
  { key: "drawCircle", icon: Circle, tooltipKey: "coordinator.airports.tools.drawCircle" },
  { key: "drawRectangle", icon: Square, tooltipKey: "coordinator.airports.tools.drawRectangle" },
  { key: "placePoint", icon: MapPin, tooltipKey: "coordinator.airports.tools.placePoint" },
];

const editTools: ToolDef[] = [
  { key: "editVertices", icon: Diamond, tooltipKey: "coordinator.airports.tools.editVertices" },
  { key: "moveFeature", icon: Move, tooltipKey: "coordinator.airports.tools.moveFeature" },
  { key: "geoJsonEditor", icon: Code2, tooltipKey: "coordinator.airports.tools.geoJsonEditor" },
];

export default function MapDrawingToolbar({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGeoJsonEditor,
  zoomPercent,
  onZoomTo,
  is3D,
  onToggle3D,
  terrainMode,
  onTerrainChange,
}: MapDrawingToolbarProps) {
  /** top-center pill-shaped drawing tools toolbar with grouped sections. */
  const { t } = useTranslation();
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!zoomDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      /** close zoom dropdown on outside click. */
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) {
        setZoomDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [zoomDropdownOpen]);

  function handleZoomInputSubmit() {
    /** parse custom zoom input and apply. */
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val > 0 && val <= 1000) {
      onZoomTo(val);
    }
    setZoomInput("");
    setZoomDropdownOpen(false);
  }

  function handleClick(tool: DrawingTool) {
    /** handle tool button click. */
    if (tool === "geoJsonEditor") {
      onGeoJsonEditor();
    } else {
      onToolChange(tool);
    }
  }

  function renderToolButton(def: ToolDef) {
    /** render a single tool button with icon and tooltip. */
    const isActive = activeTool === def.key && def.key !== "zoomReset" && def.key !== "geoJsonEditor";
    const Icon = def.icon;
    return (
      <button
        key={def.key}
        onClick={() => handleClick(def.key)}
        title={t(def.tooltipKey)}
        className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
          isActive
            ? "bg-tv-accent text-tv-accent-text"
            : "text-tv-text-primary hover:bg-tv-surface-hover"
        }`}
        data-testid={`tool-${def.key}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  function renderSeparator() {
    /** render a vertical separator between tool groups. */
    return <div className="w-px h-5 mx-0.5" style={{ backgroundColor: "var(--tv-border)" }} />;
  }

  return (
    <div
      className="flex items-center gap-2"
      data-testid="drawing-toolbar"
    >
      {/* main tools pill */}
      <div className="flex items-center rounded-full border border-tv-border bg-tv-bg px-1 py-1">
        {/* group 1 - navigation */}
        {navTools.map(renderToolButton)}

        {renderSeparator()}

        {/* group 2 - drawing */}
        {drawTools.map(renderToolButton)}

        {renderSeparator()}

        {/* group 3 - geometry editing */}
        {editTools.map(renderToolButton)}

        {renderSeparator()}

        {/* group 4 - zoom field */}
        <div className="relative" ref={zoomRef}>
          <button
            onClick={() => setZoomDropdownOpen(!zoomDropdownOpen)}
            className="w-16 text-center text-xs rounded-full px-2 py-1.5 border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
            data-testid="zoom-field"
          >
            {Math.round(zoomPercent)}%
          </button>
          {zoomDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 w-24 rounded-2xl border border-tv-border bg-tv-bg p-1 z-20">
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { onZoomTo(p); setZoomDropdownOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs rounded-xl text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                >
                  {p}%
                </button>
              ))}
              <div className="border-t border-tv-border mt-1 pt-1">
                <input
                  value={zoomInput}
                  onChange={(e) => setZoomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleZoomInputSubmit(); }}
                  placeholder="%"
                  className="w-full px-3 py-1 text-xs rounded-xl bg-tv-bg border border-tv-border text-tv-text-primary outline-none"
                  data-testid="zoom-input"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* undo/redo pill */}
      <div className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-bg px-1 py-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t("coordinator.airports.tools.undo")}
          className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
            canUndo
              ? "text-tv-text-primary hover:bg-tv-surface-hover"
              : "text-tv-text-muted opacity-40 cursor-not-allowed"
          }`}
          data-testid="tool-undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={t("coordinator.airports.tools.redo")}
          className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
            canRedo
              ? "text-tv-text-primary hover:bg-tv-surface-hover"
              : "text-tv-text-muted opacity-40 cursor-not-allowed"
          }`}
          data-testid="tool-redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* 2D/3D toggle pill */}
      <div className="flex rounded-full bg-tv-surface border border-tv-border p-0.5">
        <button
          onClick={() => onToggle3D(false)}
          title={t("map.tools.2d")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
          }`}
          data-testid="toggle-2d"
        >
          2D
        </button>
        <button
          onClick={() => onToggle3D(true)}
          title={t("map.tools.3d")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
          }`}
          data-testid="toggle-3d"
        >
          3D
        </button>
      </div>

      {/* map/satellite toggle pill */}
      <div className="flex rounded-full bg-tv-surface border border-tv-border p-0.5">
        <button
          onClick={() => onTerrainChange("map")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            terrainMode === "map" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
          }`}
          data-testid="toggle-map"
        >
          {t("dashboard.mapView")}
        </button>
        <button
          onClick={() => onTerrainChange("satellite")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            terrainMode === "satellite" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
          }`}
          data-testid="toggle-satellite"
        >
          {t("dashboard.satelliteView")}
        </button>
      </div>
    </div>
  );
}
