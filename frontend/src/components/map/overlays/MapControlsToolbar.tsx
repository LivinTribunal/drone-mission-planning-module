import { useTranslation } from "react-i18next";
import {
  Hand,
  ZoomIn,
  Maximize,
  MousePointer,
  Ruler,
  Flag,
  Circle,
  Camera,
  Box,
  Undo2,
  Redo2,
} from "lucide-react";
import { MapTool } from "@/hooks/useMapTools";

interface MapControlsToolbarProps {
  activeTool: MapTool;
  onToolChange: (tool: MapTool) => void;
  is3D: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  inspectionSelected: boolean;
}

interface ToolButton {
  tool: MapTool;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  disabled?: boolean;
  colorClass?: string;
}

export default function MapControlsToolbar({
  activeTool,
  onToolChange,
  is3D,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  inspectionSelected,
}: MapControlsToolbarProps) {
  const { t } = useTranslation();

  const tools: ToolButton[] = [
    { tool: MapTool.PAN, icon: Hand, labelKey: "map.pan" },
    { tool: MapTool.ZOOM, icon: ZoomIn, labelKey: "map.zoom" },
    { tool: MapTool.ZOOM_RESET, icon: Maximize, labelKey: "map.zoomReset" },
    { tool: MapTool.SELECT, icon: MousePointer, labelKey: "map.select" },
    { tool: MapTool.MEASURE, icon: Ruler, labelKey: "map.measureDistance" },
    {
      tool: MapTool.ADD_START,
      icon: Flag,
      labelKey: "map.addStart",
      colorClass: "text-tv-success",
    },
    {
      tool: MapTool.ADD_END,
      icon: Flag,
      labelKey: "map.addEnd",
      colorClass: "text-tv-error",
    },
    {
      tool: MapTool.WAYPOINT,
      icon: Circle,
      labelKey: "map.waypointMode",
      disabled: !inspectionSelected,
    },
    {
      tool: MapTool.CAMERA,
      icon: Camera,
      labelKey: "map.cameraMode",
      disabled: !inspectionSelected,
    },
    {
      tool: MapTool.TOGGLE_3D,
      icon: Box,
      labelKey: is3D ? "map.toggle2d" : "map.toggle3d",
    },
  ];

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2"
      data-testid="map-controls-toolbar"
    >
      {/* tool buttons */}
      <div className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-surface px-2 py-1">
        {tools.map(({ tool, icon: Icon, labelKey, disabled, colorClass }) => {
          const isActive =
            tool === MapTool.TOGGLE_3D ? is3D : activeTool === tool;
          return (
            <button
              key={tool}
              onClick={() => onToolChange(tool)}
              disabled={disabled}
              title={t(labelKey)}
              className={`flex items-center justify-center rounded-full w-9 h-9 transition-colors ${
                isActive
                  ? "bg-tv-accent text-tv-accent-text"
                  : disabled
                    ? "text-tv-text-muted opacity-40 cursor-not-allowed"
                    : `${colorClass ?? "text-tv-text-primary"} hover:bg-tv-surface-hover`
              }`}
              data-testid={`tool-${tool.toLowerCase()}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* undo / redo */}
      <div className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-surface px-2 py-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t("map.undo")}
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
          title={t("map.redo")}
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
