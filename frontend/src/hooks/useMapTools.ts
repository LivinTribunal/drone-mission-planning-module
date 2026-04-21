import { useState, useCallback, useEffect, useRef } from "react";

export enum MapTool {
  SELECT = "SELECT",
  PAN = "PAN",
  MOVE_WAYPOINT = "MOVE_WAYPOINT",
  MOVE_FEATURE = "MOVE_FEATURE",
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

// editing tools that are disabled in 3d mode
const EDITING_TOOLS = new Set([
  MapTool.MOVE_WAYPOINT,
  MapTool.MOVE_FEATURE,
  MapTool.MEASURE,
  MapTool.HEADING,
  MapTool.PLACE_TAKEOFF,
  MapTool.PLACE_LANDING,
]);

export { EDITING_TOOLS };

export default function useMapTools(): MapToolsReturn {
  const [activeTool, setActiveTool] = useState<MapTool>(MapTool.SELECT);
  const [is3D, setIs3DInternal] = useState(false);

  const setIs3D = useCallback((val: boolean) => {
    setIs3DInternal(val);
    if (val) {
      setActiveTool((prev) => (EDITING_TOOLS.has(prev) ? MapTool.SELECT : prev));
    }
  }, []);

  const setTool = useCallback((tool: MapTool) => {
    if (tool === MapTool.ZOOM_RESET) return; // one-shot action handled by toolbar, not a persistent tool
    setActiveTool(tool);
  }, []);

  const resetTool = useCallback(() => {
    setActiveTool(MapTool.SELECT);
  }, []);

  const is3DRef = useRef(is3D);
  is3DRef.current = is3D;

  // keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const trySet = (tool: MapTool) => {
        if (is3DRef.current && EDITING_TOOLS.has(tool)) return;
        setActiveTool(tool);
      };

      switch (e.key.toLowerCase()) {
        case "s":
          if (!e.ctrlKey && !e.metaKey) trySet(MapTool.SELECT);
          break;
        case "p":
          trySet(MapTool.PAN);
          break;
        case "w":
          trySet(MapTool.MOVE_WAYPOINT);
          break;
        case "v":
          trySet(MapTool.MOVE_FEATURE);
          break;
        case "m":
          trySet(MapTool.MEASURE);
          break;
        case "h":
          trySet(MapTool.HEADING);
          break;
        case "z":
          if (!e.ctrlKey && !e.metaKey) trySet(MapTool.ZOOM);
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
