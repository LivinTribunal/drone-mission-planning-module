import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMeasureDistance from "./useMeasureDistance";

describe("useMeasureDistance", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useMeasureDistance());
    expect(result.current.points).toEqual([]);
    expect(result.current.segments).toEqual([]);
    expect(result.current.totalDistance).toBe(0);
    expect(result.current.hasPoints).toBe(false);
  });

  it("first click adds a point", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    expect(result.current.points).toEqual([[18.0, 49.0]]);
    expect(result.current.hasPoints).toBe(true);
    expect(result.current.segments).toEqual([]);
  });

  it("second click creates a segment with distance", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    expect(result.current.points).toHaveLength(2);
    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0].distance).toBeGreaterThan(0);
    expect(result.current.totalDistance).toBeGreaterThan(0);
  });

  it("third click extends the path (multi-segment)", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    act(() => result.current.addPoint(18.02, 49.0));
    expect(result.current.points).toHaveLength(3);
    expect(result.current.segments).toHaveLength(2);
    expect(result.current.segments[1].cumulative).toBeGreaterThan(
      result.current.segments[0].cumulative,
    );
  });

  it("clear resets all state", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    act(() => result.current.clear());
    expect(result.current.points).toEqual([]);
    expect(result.current.segments).toEqual([]);
    expect(result.current.totalDistance).toBe(0);
  });

  it("generates GeoJSON for points and lines", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    expect(result.current.pointsGeoJSON.features).toHaveLength(2);
    expect(result.current.linesGeoJSON.features).toHaveLength(1);
    expect(result.current.labelsGeoJSON.features).toHaveLength(1);
  });

  it("max 25 points", () => {
    const { result } = renderHook(() => useMeasureDistance());
    for (let i = 0; i < 30; i++) {
      act(() => result.current.addPoint(18.0 + i * 0.001, 49.0));
    }
    expect(result.current.points).toHaveLength(25);
  });
});
