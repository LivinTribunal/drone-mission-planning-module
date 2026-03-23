import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMapTools, { MapTool } from "./useMapTools";

describe("useMapTools", () => {
  it("starts with PAN tool and 2D mode", () => {
    const { result } = renderHook(() => useMapTools());
    expect(result.current.activeTool).toBe(MapTool.PAN);
    expect(result.current.is3D).toBe(false);
  });

  it("setTool changes active tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.SELECT));
    expect(result.current.activeTool).toBe(MapTool.SELECT);
  });

  it("TOGGLE_3D toggles is3D and resets to PAN", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.SELECT));
    act(() => result.current.setTool(MapTool.TOGGLE_3D));
    expect(result.current.is3D).toBe(true);
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("ZOOM_RESET resets to PAN", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.SELECT));
    act(() => result.current.setTool(MapTool.ZOOM_RESET));
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("resetTool goes back to PAN", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.MEASURE));
    act(() => result.current.resetTool());
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });
});
