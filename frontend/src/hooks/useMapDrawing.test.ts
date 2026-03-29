import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMapDrawing from "./useMapDrawing";

describe("useMapDrawing", () => {
  it("starts with select tool and no features", () => {
    const { result } = renderHook(() => useMapDrawing());
    expect(result.current.activeTool).toBe("select");
    expect(result.current.drawnFeatures).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("adds a feature and enables undo", () => {
    const { result } = renderHook(() => useMapDrawing());
    const feature = {
      id: "f1",
      geometry: { type: "Point" as const, coordinates: [0, 0, 0] },
      properties: {},
    };
    act(() => result.current.addFeature(feature));
    expect(result.current.drawnFeatures).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
  });

  it("removes a feature and enables undo", () => {
    const { result } = renderHook(() => useMapDrawing());
    const feature = {
      id: "f1",
      geometry: { type: "Point" as const, coordinates: [0, 0, 0] },
      properties: {},
    };
    act(() => result.current.addFeature(feature));
    act(() => result.current.removeFeature("f1"));
    expect(result.current.drawnFeatures).toHaveLength(0);
    expect(result.current.canUndo).toBe(true);
  });

  it("undo is available after add", () => {
    const { result } = renderHook(() => useMapDrawing());
    const feature = {
      id: "f1",
      geometry: { type: "Point" as const, coordinates: [0, 0, 0] },
      properties: {},
    };
    act(() => result.current.addFeature(feature));
    expect(result.current.canUndo).toBe(true);
  });

  it("updates feature geometry", () => {
    const { result } = renderHook(() => useMapDrawing());
    const feature = {
      id: "f1",
      geometry: { type: "Point" as const, coordinates: [0, 0, 0] },
      properties: {},
    };
    act(() => result.current.addFeature(feature));
    const newGeom = { type: "Point" as const, coordinates: [1, 1, 0] };
    act(() => result.current.updateFeature("f1", newGeom));
    expect(result.current.drawnFeatures[0].geometry).toEqual(newGeom);
  });

  it("clearFeatures removes all and resets undo", () => {
    const { result } = renderHook(() => useMapDrawing());
    act(() =>
      result.current.addFeature({
        id: "f1",
        geometry: { type: "Point" as const, coordinates: [0, 0, 0] },
        properties: {},
      }),
    );
    act(() => result.current.clearFeatures());
    expect(result.current.drawnFeatures).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });
});
