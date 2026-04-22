import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import type { RefObject } from "react";
import type maplibregl from "maplibre-gl";
import type { Viewer as CesiumViewerType } from "cesium";
import {
  computeMapLibreFocus,
  flyMapLibreToFeature,
  cesiumRangeForFeature,
  useFocusFeature,
} from "./useFocusFeature";
import type { MapFeature } from "@/types/map";

function waypointFeature(): MapFeature {
  return {
    type: "waypoint",
    data: {
      id: "wp1",
      waypoint_type: "MEASUREMENT",
      sequence_order: 3,
      position: { type: "Point", coordinates: [14.5, 50.1, 120] },
      stack_count: 1,
    },
  };
}

function obstacleFeature(): MapFeature {
  return {
    type: "obstacle",
    data: {
      id: "o1",
      airport_id: "a1",
      name: "Tower",
      type: "TOWER",
      boundary: {
        type: "Polygon",
        coordinates: [[[14.5, 50.1], [14.6, 50.1], [14.55, 50.2], [14.5, 50.1]]],
      },
      height: 50,
    },
  } as unknown as MapFeature;
}

describe("computeMapLibreFocus", () => {
  it("returns coords and minZoom 17 for a waypoint", () => {
    const focus = computeMapLibreFocus(waypointFeature());
    expect(focus).not.toBeNull();
    expect(focus?.lon).toBe(14.5);
    expect(focus?.lat).toBe(50.1);
    expect(focus?.minZoom).toBe(17);
  });

  it("computes polygon centroid for obstacles", () => {
    const focus = computeMapLibreFocus(obstacleFeature());
    expect(focus).not.toBeNull();
    // ring has 4 points (first == last); average of all 4
    const expLon = (14.5 + 14.6 + 14.55 + 14.5) / 4;
    const expLat = (50.1 + 50.1 + 50.2 + 50.1) / 4;
    expect(focus?.lon).toBeCloseTo(expLon, 5);
    expect(focus?.lat).toBeCloseTo(expLat, 5);
  });
});

describe("flyMapLibreToFeature", () => {
  it("calls map.flyTo with feature center and >= minZoom", () => {
    const flyTo = vi.fn();
    const getZoom = vi.fn(() => 10);
    const map = { flyTo, getZoom } as unknown as maplibregl.Map;

    flyMapLibreToFeature(map, waypointFeature());

    expect(flyTo).toHaveBeenCalledTimes(1);
    const call = flyTo.mock.calls[0][0];
    expect(call.center).toEqual([14.5, 50.1]);
    expect(call.zoom).toBeGreaterThanOrEqual(17);
    expect(call.duration).toBe(800);
  });

  it("preserves current zoom when it already exceeds minZoom", () => {
    const flyTo = vi.fn();
    const map = { flyTo, getZoom: () => 19 } as unknown as maplibregl.Map;

    flyMapLibreToFeature(map, waypointFeature());

    const call = flyTo.mock.calls[0][0];
    expect(call.zoom).toBe(19);
  });
});

describe("cesiumRangeForFeature", () => {
  it("returns tighter range for point-like features", () => {
    expect(cesiumRangeForFeature({ type: "agl" } as MapFeature)).toBe(100);
    expect(cesiumRangeForFeature({ type: "lha" } as MapFeature)).toBe(100);
    expect(cesiumRangeForFeature({ type: "obstacle" } as MapFeature)).toBe(150);
  });

  it("returns a wider range for surfaces and waypoints", () => {
    expect(cesiumRangeForFeature({ type: "surface" } as MapFeature)).toBe(500);
    expect(cesiumRangeForFeature({ type: "waypoint" } as MapFeature)).toBe(300);
  });
});

describe("useFocusFeature", () => {
  it("does nothing when called with null feature", () => {
    const flyTo = vi.fn();
    const mapRef = { current: { flyTo, getZoom: () => 10 } } as unknown as RefObject<maplibregl.Map | null>;

    const { result } = renderHook(() => useFocusFeature({ mapRef }));
    result.current.locateFeature(null);

    expect(flyTo).not.toHaveBeenCalled();
  });

  it("dispatches to the maplibre map when no cesium viewer is live", () => {
    const flyTo = vi.fn();
    const mapRef = { current: { flyTo, getZoom: () => 10 } } as unknown as RefObject<maplibregl.Map | null>;

    const { result } = renderHook(() => useFocusFeature({ mapRef }));
    result.current.locateFeature(waypointFeature());

    expect(flyTo).toHaveBeenCalledTimes(1);
  });

  it("prefers cesium when both refs are live", async () => {
    const flyTo = vi.fn();
    const viewer = {
      isDestroyed: () => false,
      entities: { values: [] },
      camera: { flyTo: vi.fn() },
    } as unknown as CesiumViewerType;
    const cesiumViewerRef = { current: viewer } as RefObject<CesiumViewerType | null>;
    const mapRef = { current: { flyTo, getZoom: () => 10 } } as unknown as RefObject<maplibregl.Map | null>;

    const { result } = renderHook(() => useFocusFeature({ mapRef, cesiumViewerRef }));
    result.current.locateFeature(waypointFeature());

    // maplibre must not receive the call when cesium is live
    expect(flyTo).not.toHaveBeenCalled();
  });

  it("skips cesium viewer if destroyed, falls through to maplibre", () => {
    const flyTo = vi.fn();
    const viewer = { isDestroyed: () => true } as unknown as CesiumViewerType;
    const cesiumViewerRef = { current: viewer } as RefObject<CesiumViewerType | null>;
    const mapRef = { current: { flyTo, getZoom: () => 10 } } as unknown as RefObject<maplibregl.Map | null>;

    const { result } = renderHook(() => useFocusFeature({ mapRef, cesiumViewerRef }));
    result.current.locateFeature(waypointFeature());

    expect(flyTo).toHaveBeenCalledTimes(1);
  });
});

describe("useFocusFeature stability", () => {
  it("returns a stable locateFeature reference across renders when refs don't change", () => {
    const mapRef = { current: null } as RefObject<maplibregl.Map | null>;
    const { result, rerender } = renderHook(() =>
      useRef(useFocusFeature({ mapRef })).current,
    );
    const first = result.current.locateFeature;
    rerender();
    const second = result.current.locateFeature;
    expect(first).toBe(second);
  });
});
