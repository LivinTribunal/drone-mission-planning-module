import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  MousePointer,
  Hand,
  Move,
  Ruler,
  Navigation,
  Search,
  Maximize,
  Undo2,
  Redo2,
  Play,
  Pause,
  Square,
} from "lucide-react";
import { MapTool, EDITING_TOOLS } from "@/hooks/useMapTools";
import type { FlyAlongState, FlyAlongSpeed } from "@/types/map";

interface MapControlsToolbarProps {
  activeTool: MapTool;
  onToolChange: (tool: MapTool) => void;
  is3D: boolean;
  onToggle3D: (val: boolean) => void;
  terrainMode: "map" | "satellite";
  onTerrainChange: (mode: "map" | "satellite") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomReset: () => void;
  zoomPercent: number;
  onZoomTo: (percent: number) => void;
  bearing?: number;
  onBearingReset?: () => void;
  hasTrajectory?: boolean;
  flyAlongState?: FlyAlongState;
  onFlyAlongPlay?: () => void;
  onFlyAlongPause?: () => void;
  onFlyAlongStop?: () => void;
  onFlyAlongSpeedChange?: (speed: FlyAlongSpeed) => void;
}

const ZOOM_PRESETS = [50, 75, 100, 150, 200, 300, 500];
const FLY_ALONG_SPEEDS: FlyAlongSpeed[] = [1, 2, 5, 10];

interface ToolDef {
  tool: MapTool;
  icon: React.ComponentType<{ className?: string }>;
  tooltipKey: string;
}

const mainTools: ToolDef[] = [
  { tool: MapTool.SELECT, icon: MousePointer, tooltipKey: "map.tools.select" },
  { tool: MapTool.PAN, icon: Hand, tooltipKey: "map.tools.pan" },
  { tool: MapTool.MOVE_WAYPOINT, icon: Move, tooltipKey: "map.tools.moveWaypoint" },
  { tool: MapTool.MEASURE, icon: Ruler, tooltipKey: "map.tools.measure" },
  { tool: MapTool.HEADING, icon: Navigation, tooltipKey: "map.tools.heading" },
];

const zoomTools: ToolDef[] = [
  { tool: MapTool.ZOOM, icon: Search, tooltipKey: "map.tools.zoom" },
];

export default function MapControlsToolbar({
  activeTool,
  onToolChange,
  is3D,
  onToggle3D,
  terrainMode,
  onTerrainChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomReset,
  zoomPercent,
  onZoomTo,
  bearing = 0,
  onBearingReset,
  hasTrajectory,
  flyAlongState,
  onFlyAlongPlay,
  onFlyAlongPause,
  onFlyAlongStop,
  onFlyAlongSpeedChange,
}: MapControlsToolbarProps) {
  const { t } = useTranslation();
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const zoomRef = useRef<HTMLDivElement>(null);

  // close zoom dropdown on outside click
  useEffect(() => {
    if (!zoomDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) {
        setZoomDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [zoomDropdownOpen]);

  function handleZoomInputSubmit() {
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val > 0 && val <= 1000) {
      onZoomTo(val);
    }
    setZoomInput("");
    setZoomDropdownOpen(false);
  }

  function renderToolButton(def: ToolDef) {
    const isActive = activeTool === def.tool;
    const isDisabled = is3D && EDITING_TOOLS.has(def.tool);
    const Icon = def.icon;
    const tooltip = isDisabled ? t("map.editIn2d") : t(def.tooltipKey);

    return (
      <button
        key={def.tool}
        onClick={() => !isDisabled && onToolChange(def.tool)}
        title={tooltip}
        disabled={isDisabled}
        className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
          isDisabled
            ? "text-tv-text-muted opacity-40 cursor-not-allowed"
            : isActive
              ? "bg-tv-accent text-tv-accent-text"
              : "text-tv-text-primary hover:bg-tv-surface-hover"
        }`}
        data-testid={`tool-${def.tool.toLowerCase()}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  const showFlyAlong = is3D && hasTrajectory && flyAlongState;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2"
      data-testid="map-controls-toolbar"
    >
      {/* main tools group */}
      <div className="flex items-center rounded-full border border-tv-border bg-tv-bg px-1 py-1">
        {mainTools.map(renderToolButton)}

        {/* separator */}
        <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--tv-border)" }} />

        {/* zoom tools */}
        {zoomTools.map(renderToolButton)}
        <button
          onClick={onZoomReset}
          title={t("map.tools.zoomReset")}
          className="flex items-center justify-center rounded-full w-9 h-9 text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
          data-testid="tool-zoom_reset"
        >
          <Maximize className="h-4 w-4" />
        </button>

        {/* zoom field */}
        <div className="relative ml-1" ref={zoomRef}>
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
                />
              </div>
            </div>
          )}
        </div>

        {/* heading compass */}
        <button
          onClick={onBearingReset}
          className="ml-1 flex items-center justify-center w-9 h-9 rounded-full border border-tv-border bg-tv-surface hover:bg-tv-surface-hover transition-colors cursor-pointer"
          title={`${Math.round(((bearing % 360) + 360) % 360)}° — ${t("map.tools.resetBearing")}`}
        >
          <svg
            className="w-7 h-7"
            viewBox="0 0 28 28"
            style={{ transform: `rotate(${-bearing}deg)` }}
          >
            <text x="14" y="5.5" textAnchor="middle" dominantBaseline="middle" fill="var(--tv-accent)" fontSize="5.5" fontWeight="bold">N</text>
            <polygon points="14,8 12.8,14 15.2,14" fill="var(--tv-accent)" />
            <polygon points="14,20 12.8,14 15.2,14" fill="var(--tv-text-muted)" />
          </svg>
        </button>

        {/* separator */}
        <div className="w-px h-5 mx-0.5" style={{ backgroundColor: "var(--tv-border)" }} />

        {/* 2D/3D toggle */}
        <div className="flex rounded-full bg-tv-surface border border-tv-border p-0.5">
          <button
            onClick={() => onToggle3D(false)}
            title={t("map.tools.2d")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
            }`}
          >
            {t("common.2d")}
          </button>
          <button
            onClick={() => onToggle3D(true)}
            title={t("map.tools.3d")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
            }`}
          >
            {t("common.3d")}
          </button>
        </div>

        {/* map/satellite toggle */}
        <div className="ml-1 flex rounded-full bg-tv-surface border border-tv-border p-0.5">
          <button
            onClick={() => onTerrainChange("map")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              terrainMode === "map" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
            }`}
          >
            {t("dashboard.mapView")}
          </button>
          <button
            onClick={() => onTerrainChange("satellite")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              terrainMode === "satellite" ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
            }`}
          >
            {t("dashboard.satelliteView")}
          </button>
        </div>
      </div>

      {/* fly-along controls - only in 3d with trajectory */}
      {showFlyAlong && (
        <div className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-bg px-1 py-1">
          {flyAlongState.status === "playing" ? (
            <button
              onClick={onFlyAlongPause}
              title={t("map.pause")}
              className="flex items-center justify-center rounded-full w-9 h-9 text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="fly-along-pause"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onFlyAlongPlay}
              title={t("map.play")}
              className="flex items-center justify-center rounded-full w-9 h-9 text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="fly-along-play"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onFlyAlongStop}
            title={t("map.stop")}
            disabled={flyAlongState.status === "idle"}
            className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
              flyAlongState.status === "idle"
                ? "text-tv-text-muted opacity-40 cursor-not-allowed"
                : "text-tv-text-primary hover:bg-tv-surface-hover"
            }`}
            data-testid="fly-along-stop"
          >
            <Square className="h-3.5 w-3.5" />
          </button>

          {/* speed selector */}
          <div className="flex rounded-full bg-tv-surface border border-tv-border p-0.5">
            {FLY_ALONG_SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => onFlyAlongSpeedChange?.(speed)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                  flyAlongState.speed === speed
                    ? "bg-tv-accent text-tv-accent-text"
                    : "text-tv-text-secondary"
                }`}
              >
                {t("map.speedMultiplier", { value: speed })}
              </button>
            ))}
          </div>

          {/* progress bar */}
          {flyAlongState.status !== "idle" && (
            <div className="w-20 h-1.5 rounded-full bg-tv-surface overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${flyAlongState.progress}%`,
                  backgroundColor: "var(--tv-accent)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* undo / redo pill */}
      <div className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-bg px-1 py-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t("map.tools.undo")}
          className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
            canUndo
              ? "text-tv-text-primary hover:bg-tv-surface-hover"
              : "text-tv-text-muted opacity-40 cursor-not-allowed"
          }`}
          data-testid="undo-btn"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={t("map.tools.redo")}
          className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
            canRedo
              ? "text-tv-text-primary hover:bg-tv-surface-hover"
              : "text-tv-text-muted opacity-40 cursor-not-allowed"
          }`}
          data-testid="redo-btn"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
