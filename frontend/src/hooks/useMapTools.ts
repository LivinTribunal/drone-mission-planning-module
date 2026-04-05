import { useState, useCallback, useEffect } from "react";

export enum MapTool {
  SELECT = "SELECT",
  PAN = "PAN",
  MOVE_WAYPOINT = "MOVE_WAYPOINT",
  MEASURE = "MEASURE",
  HEADING = "HEADING",
  ZOOM = "ZOOM",
  ZOOM_RESET = "ZOOM_RESET",
  PLACE_TAKEOFF = "PLACE_TAKEOFF",
  PLACE_LANDING = "PLACE_LANDING",
}

interface MapToolsReturn {
  activeTool: MapTool;
  is3D: boolean;
  setTool: (tool: MapTool) => void;
  resetTool: () => void;
  setIs3D: (val: boolean) => void;
}

export default function useMapTools(): MapToolsReturn {
  const [activeTool, setActiveTool] = useState<MapTool>(MapTool.SELECT);
  const [is3D, setIs3D] = useState(false);

  const setTool = useCallback((tool: MapTool) => {
    if (tool === MapTool.ZOOM_RESET) return; // one-shot action handled by toolbar, not a persistent tool
    setActiveTool(tool);
  }, []);

  const resetTool = useCallback(() => {
    setActiveTool(MapTool.SELECT);
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key.toLowerCase()) {
        case "s":
          if (!e.ctrlKey && !e.metaKey) setActiveTool(MapTool.SELECT);
          break;
        case "p":
          setActiveTool(MapTool.PAN);
          break;
        case "w":
          setActiveTool(MapTool.MOVE_WAYPOINT);
          break;
        case "m":
          setActiveTool(MapTool.MEASURE);
          break;
        case "h":
          setActiveTool(MapTool.HEADING);
          break;
        case "z":
          if (!e.ctrlKey && !e.metaKey) setActiveTool(MapTool.ZOOM);
          break;
        case "r":
          // zoom reset is handled by the toolbar/page
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { activeTool, is3D, setTool, resetTool, setIs3D };
}
