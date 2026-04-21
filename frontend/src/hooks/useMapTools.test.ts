import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMapTools, { MapTool, EDITING_TOOLS } from "./useMapTools";

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

  it("switching to 3d resets editing tools to SELECT", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.MOVE_WAYPOINT));
    expect(result.current.activeTool).toBe(MapTool.MOVE_WAYPOINT);

    act(() => result.current.setIs3D(true));
    expect(result.current.activeTool).toBe(MapTool.SELECT);
  });

  it("switching to 3d keeps non-editing tools", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.PAN));
    act(() => result.current.setIs3D(true));
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("keyboard shortcut p sets PAN tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    });
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("keyboard shortcut s sets SELECT tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.PAN));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    });
    expect(result.current.activeTool).toBe(MapTool.SELECT);
  });

  it("keyboard shortcut w sets MOVE_WAYPOINT tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    });
    expect(result.current.activeTool).toBe(MapTool.MOVE_WAYPOINT);
  });

  it("keyboard shortcut v sets MOVE_FEATURE tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    });
    expect(result.current.activeTool).toBe(MapTool.MOVE_FEATURE);
  });

  it("setTool can activate MOVE_FEATURE", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.MOVE_FEATURE));
    expect(result.current.activeTool).toBe(MapTool.MOVE_FEATURE);
  });

  it("switching to 3d resets MOVE_FEATURE to SELECT", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setTool(MapTool.MOVE_FEATURE));
    expect(result.current.activeTool).toBe(MapTool.MOVE_FEATURE);
    act(() => result.current.setIs3D(true));
    expect(result.current.activeTool).toBe(MapTool.SELECT);
  });

  it("keyboard shortcut m sets MEASURE tool", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    });
    expect(result.current.activeTool).toBe(MapTool.MEASURE);
  });

  it("keyboard shortcuts block editing tools in 3d mode", () => {
    const { result } = renderHook(() => useMapTools());
    act(() => result.current.setIs3D(true));
    act(() => result.current.setTool(MapTool.PAN));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    });
    expect(result.current.activeTool).toBe(MapTool.PAN);
  });

  it("keyboard shortcuts ignore input elements", () => {
    const { result } = renderHook(() => useMapTools());
    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "p", bubbles: true });
      Object.defineProperty(event, "target", { value: input });
      window.dispatchEvent(event);
    });
    expect(result.current.activeTool).toBe(MapTool.SELECT);

    document.body.removeChild(input);
  });

  it("EDITING_TOOLS contains the expected tools", () => {
    expect(EDITING_TOOLS.has(MapTool.MOVE_WAYPOINT)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.MOVE_FEATURE)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.MEASURE)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.HEADING)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.PLACE_TAKEOFF)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.PLACE_LANDING)).toBe(true);
    expect(EDITING_TOOLS.has(MapTool.SELECT)).toBe(false);
  });
});
