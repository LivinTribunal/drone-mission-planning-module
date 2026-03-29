import { useState, useCallback, useRef } from "react";
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
  const featuresRef = useRef<DrawnFeature[]>([]);
  const undoRedo = useUndoRedo<UndoAction>(10);

  const updateFeatures = useCallback((updater: (prev: DrawnFeature[]) => DrawnFeature[]) => {
    /** update drawn features state and keep ref in sync. */
    setDrawnFeatures((prev) => {
      const next = updater(prev);
      featuresRef.current = next;
      return next;
    });
  }, []);

  const addFeature = useCallback(
    (feature: DrawnFeature) => {
      /** add a new drawn feature and record undo action. */
      updateFeatures((prev) => [...prev, feature]);
      undoRedo.push({ type: "add", featureId: feature.id, after: feature });
    },
    [undoRedo, updateFeatures],
  );

  const removeFeature = useCallback(
    (id: string) => {
      /** remove a drawn feature and record undo action. */
      const removed = featuresRef.current.find((f) => f.id === id);
      updateFeatures((prev) => prev.filter((f) => f.id !== id));
      if (removed) {
        undoRedo.push({ type: "remove", featureId: id, before: removed });
      }
    },
    [undoRedo, updateFeatures],
  );

  const updateFeature = useCallback(
    (id: string, geometry: GeoJSON.Geometry) => {
      /** update feature geometry and record undo action. */
      const before = featuresRef.current.find((f) => f.id === id);
      const after = before ? { ...before, geometry } : undefined;
      updateFeatures((prev) =>
        prev.map((f) => (f.id === id ? { ...f, geometry } : f)),
      );
      if (before && after) {
        undoRedo.push({ type: "modify", featureId: id, before, after });
      }
    },
    [undoRedo, updateFeatures],
  );

  const clearFeatures = useCallback(() => {
    /** clear all drawn features. */
    updateFeatures(() => []);
    undoRedo.clear();
  }, [undoRedo, updateFeatures]);

  const undo = useCallback(() => {
    /** undo last drawing action. */
    const action = undoRedo.undo();
    if (!action) return;
    if (action.type === "add") {
      updateFeatures((prev) => prev.filter((f) => f.id !== action.featureId));
    } else if (action.type === "remove" && action.before) {
      updateFeatures((prev) => [...prev, action.before!]);
    } else if (action.type === "modify" && action.before) {
      updateFeatures((prev) =>
        prev.map((f) => (f.id === action.featureId ? action.before! : f)),
      );
    }
  }, [undoRedo, updateFeatures]);

  const redo = useCallback(() => {
    /** redo last undone action. */
    const action = undoRedo.redo();
    if (!action) return;
    if (action.type === "add" && action.after) {
      updateFeatures((prev) => [...prev, action.after!]);
    } else if (action.type === "remove") {
      updateFeatures((prev) => prev.filter((f) => f.id !== action.featureId));
    } else if (action.type === "modify" && action.after) {
      updateFeatures((prev) =>
        prev.map((f) => (f.id === action.featureId ? action.after! : f)),
      );
    }
  }, [undoRedo, updateFeatures]);

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
