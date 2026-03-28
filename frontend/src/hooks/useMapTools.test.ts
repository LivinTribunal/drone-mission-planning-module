import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMapTools, { MapTool } from "./useMapTools";

describe("useMapTools", () => {
  it("starts with SELECT tool and 2D mode", () => {
    const { result } = renderHook(() => useMapTools());
    expect(result.current.activeTool).toBe(MapTool.SELECT);
    expect(result.current.is3D).toBe(false);
  });

  it("setTool changes active tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.PAN));
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("setIs3D toggles 3D mode", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setIs3D(true));
    expect(result.current.is3D).toBe(true);
    act(() => result.current.setIs3D(false));
    expect(result.current.is3D).toBe(false);
  });

  it("ZOOM_RESET does not change active tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.PAN));
    act(() => result.current.setTool(MapTool.ZOOM_RESET));
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("resetTool goes back to SELECT", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.MEASURE));
    act(() => result.current.resetTool());
    expect(result.current.activeTool).toBe(MapTool.SELECT);
  });
});
