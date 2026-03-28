import { useState, useCallback } from "react";
import useUndoRedo from "./useUndoRedo";
import type { DrawingTool } from "@/components/coordinator/MapDrawingToolbar";

interface DrawnFeature {
  id: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

interface UndoAction {
  type: "add" | "remove" | "modify";
  featureId: string;
  before?: DrawnFeature;
  after?: DrawnFeature;
}

interface MapDrawingReturn {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  drawnFeatures: DrawnFeature[];
  addFeature: (feature: DrawnFeature) => void;
  removeFeature: (id: string) => void;
  updateFeature: (id: string, geometry: GeoJSON.Geometry) => void;
  clearFeatures: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function useMapDrawing(): MapDrawingReturn {
  /** manage drawing tools state and undo/redo for map editor. */
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([]);
  const undoRedo = useUndoRedo<UndoAction>(10);

  const addFeature = useCallback(
    (feature: DrawnFeature) => {
      /** add a new drawn feature and record undo action. */
      setDrawnFeatures((prev) => [...prev, feature]);
      undoRedo.push({ type: "add", featureId: feature.id, after: feature });
    },
    [undoRedo],
  );

  const removeFeature = useCallback(
    (id: string) => {
      /** remove a drawn feature and record undo action. */
      setDrawnFeatures((prev) => {
        const feature = prev.find((f) => f.id === id);
        if (feature) {
          undoRedo.push({ type: "remove", featureId: id, before: feature });
        }
        return prev.filter((f) => f.id !== id);
      });
    },
    [undoRedo],
  );

  const updateFeature = useCallback(
    (id: string, geometry: GeoJSON.Geometry) => {
      /** update feature geometry and record undo action. */
      setDrawnFeatures((prev) =>
        prev.map((f) => {
          if (f.id === id) {
            undoRedo.push({
              type: "modify",
              featureId: id,
              before: f,
              after: { ...f, geometry },
            });
            return { ...f, geometry };
          }
          return f;
        }),
      );
    },
    [undoRedo],
  );

  const clearFeatures = useCallback(() => {
    /** clear all drawn features. */
    setDrawnFeatures([]);
    undoRedo.clear();
  }, [undoRedo]);

  const undo = useCallback(() => {
    /** undo last drawing action. */
    const action = undoRedo.undo();
    if (!action) return;
    if (action.type === "add") {
      setDrawnFeatures((prev) => prev.filter((f) => f.id !== action.featureId));
    } else if (action.type === "remove" && action.before) {
      setDrawnFeatures((prev) => [...prev, action.before!]);
    } else if (action.type === "modify" && action.before) {
      setDrawnFeatures((prev) =>
        prev.map((f) => (f.id === action.featureId ? action.before! : f)),
      );
    }
  }, [undoRedo]);

  const redo = useCallback(() => {
    /** redo last undone action. */
    const action = undoRedo.redo();
    if (!action) return;
    if (action.type === "add" && action.after) {
      setDrawnFeatures((prev) => [...prev, action.after!]);
    } else if (action.type === "remove") {
      setDrawnFeatures((prev) => prev.filter((f) => f.id !== action.featureId));
    } else if (action.type === "modify" && action.after) {
      setDrawnFeatures((prev) =>
        prev.map((f) => (f.id === action.featureId ? action.after! : f)),
      );
    }
  }, [undoRedo]);

  return {
    activeTool,
    setActiveTool,
    drawnFeatures,
    addFeature,
    removeFeature,
    updateFeature,
    clearFeatures,
    undo,
    redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
  };
}
