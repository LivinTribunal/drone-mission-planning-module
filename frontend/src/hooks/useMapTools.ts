import { useState, useCallback } from "react";

export enum MapTool {
  PAN = "PAN",
  ZOOM = "ZOOM",
  ZOOM_RESET = "ZOOM_RESET",
  SELECT = "SELECT",
  MEASURE = "MEASURE",
  ADD_START = "ADD_START",
  ADD_END = "ADD_END",
  WAYPOINT = "WAYPOINT",
  CAMERA = "CAMERA",
  TOGGLE_3D = "TOGGLE_3D",
}

interface MapToolsReturn {
  activeTool: MapTool;
  is3D: boolean;
  setTool: (tool: MapTool) => void;
  resetTool: () => void;
}

export default function useMapTools(): MapToolsReturn {
  const [activeTool, setActiveTool] = useState<MapTool>(MapTool.PAN);
  const [is3D, setIs3D] = useState(false);

  const setTool = useCallback((tool: MapTool) => {
    if (tool === MapTool.TOGGLE_3D) {
      setIs3D((prev) => !prev);
      setActiveTool(MapTool.PAN);
      return;
    }
    if (tool === MapTool.ZOOM_RESET) {
      // zoom reset is a one-shot action, reset to pan
      setActiveTool(MapTool.PAN);
      return;
    }
    setActiveTool(tool);
  }, []);

  const resetTool = useCallback(() => {
    setActiveTool(MapTool.PAN);
  }, []);

  return { activeTool, is3D, setTool, resetTool };
}
