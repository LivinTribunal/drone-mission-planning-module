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
  | "geoJsonEditor";

interface MapDrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGeoJsonEditor: () => void;
}

const TOOLS: { key: DrawingTool; icon: typeof Hand }[] = [
  { key: "pan", icon: Hand },
  { key: "zoom", icon: ZoomIn },
  { key: "zoomReset", icon: Maximize2 },
  { key: "select", icon: MousePointer2 },
  { key: "drawPolygon", icon: Pentagon },
  { key: "drawCircle", icon: Circle },
  { key: "drawRectangle", icon: Square },
  { key: "placePoint", icon: MapPin },
  { key: "geoJsonEditor", icon: Code2 },
];

export default function MapDrawingToolbar({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGeoJsonEditor,
}: MapDrawingToolbarProps) {
  /** top-center pill-shaped drawing tools toolbar. */
  const { t } = useTranslation();

  function handleClick(tool: DrawingTool) {
    /** handle tool button click. */
    if (tool === "geoJsonEditor") {
      onGeoJsonEditor();
    } else {
      onToolChange(tool);
    }
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-tv-surface border border-tv-border p-1"
      data-testid="drawing-toolbar"
    >
      {TOOLS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          title={t(`coordinator.tools.${key}`)}
          className={`rounded-full p-2 transition-colors ${
            activeTool === key
              ? "bg-tv-accent text-tv-accent-text"
              : "text-tv-text-secondary hover:bg-tv-surface-hover hover:text-tv-text-primary"
          }`}
          data-testid={`tool-${key}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}

      <div className="w-px h-6 bg-tv-border mx-1" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={t("coordinator.tools.undo")}
        className={`rounded-full p-2 transition-colors ${
          canUndo
            ? "text-tv-text-secondary hover:bg-tv-surface-hover hover:text-tv-text-primary"
            : "text-tv-text-muted opacity-50 cursor-not-allowed"
        }`}
        data-testid="tool-undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title={t("coordinator.tools.redo")}
        className={`rounded-full p-2 transition-colors ${
          canRedo
            ? "text-tv-text-secondary hover:bg-tv-surface-hover hover:text-tv-text-primary"
            : "text-tv-text-muted opacity-50 cursor-not-allowed"
        }`}
        data-testid="tool-redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
