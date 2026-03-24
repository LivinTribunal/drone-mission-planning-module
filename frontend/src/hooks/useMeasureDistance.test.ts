import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useMeasureDistance from "./useMeasureDistance";

describe("useMeasureDistance", () => {
  it("starts with null state", () => {
    const { result } = renderHook(() => useMeasureDistance());
    expect(result.current.firstPoint).toBeNull();
    expect(result.current.secondPoint).toBeNull();
    expect(result.current.distance).toBeNull();
    expect(result.current.lineGeoJSON).toBeNull();
  });

  it("first click sets firstPoint only", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    expect(result.current.firstPoint).toEqual([18.0, 49.0]);
    expect(result.current.secondPoint).toBeNull();
    expect(result.current.distance).toBeNull();
  });

  it("second click sets secondPoint and computes distance", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    expect(result.current.secondPoint).toEqual([18.01, 49.0]);
    expect(result.current.distance).toBeGreaterThan(0);
    expect(result.current.lineGeoJSON).not.toBeNull();
  });

  it("third click starts new measurement", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    act(() => result.current.addPoint(18.02, 49.0));
    expect(result.current.firstPoint).toEqual([18.02, 49.0]);
    expect(result.current.secondPoint).toBeNull();
    expect(result.current.distance).toBeNull();
  });

  it("clear resets all state", () => {
    const { result } = renderHook(() => useMeasureDistance());
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.01, 49.0));
    act(() => result.current.clear());
    expect(result.current.firstPoint).toBeNull();
    expect(result.current.secondPoint).toBeNull();
    expect(result.current.distance).toBeNull();
  });

  it("formats label as meters for short distances", () => {
    const { result } = renderHook(() => useMeasureDistance());
    // two points very close together - should be meters
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(18.001, 49.0));
    expect(result.current.labelText).toMatch(/m$/);
  });

  it("formats label as km for long distances", () => {
    const { result } = renderHook(() => useMeasureDistance());
    // two points far apart - should be km
    act(() => result.current.addPoint(18.0, 49.0));
    act(() => result.current.addPoint(19.0, 49.0));
    expect(result.current.labelText).toMatch(/km$/);
  });
});
