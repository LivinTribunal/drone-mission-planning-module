import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useCesiumSync from "./useCesiumSync";

vi.mock("@/components/map/cesium/cesiumUtils", () => ({
  maplibreToCesiumCamera: vi.fn(() => ({
    destination: { x: 1, y: 2, z: 3 },
    orientation: { heading: 0, pitch: -1.57, roll: 0 },
  })),
  cesiumToMaplibreCamera: vi.fn(() => ({
    center: { lng: 17.2, lat: 48.1 },
    zoom: 14,
    bearing: 0,
    pitch: 0,
  })),
}));

import {
  maplibreToCesiumCamera,
  cesiumToMaplibreCamera,
} from "@/components/map/cesium/cesiumUtils";

function createMockMap() {
  return {
    getCenter: vi.fn(() => ({ lng: 17.2, lat: 48.1 })),
    getZoom: vi.fn(() => 14),
    getBearing: vi.fn(() => 0),
    getPitch: vi.fn(() => 0),
    getContainer: vi.fn(() => ({ clientHeight: 800 })),
    jumpTo: vi.fn(),
  };
}

function createMockViewer() {
  return {
    camera: {
      setView: vi.fn(),
      position: { x: 1, y: 2, z: 3 },
      heading: 0,
      pitch: -1.57,
    },
  };
}

describe("useCesiumSync", () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1000);
  });

  it("syncToCesium does nothing when mapRef.current is null", () => {
    const mapRef = { current: null };
    const { result } = renderHook(() => useCesiumSync(mapRef));
    const viewer = createMockViewer();

    result.current.syncToCesium(viewer as never);

    expect(maplibreToCesiumCamera).not.toHaveBeenCalled();
    expect(viewer.camera.setView).not.toHaveBeenCalled();
  });

  it("syncToCesium reads map state and calls viewer.camera.setView", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    result.current.syncToCesium(viewer as never);

    expect(map.getCenter).toHaveBeenCalled();
    expect(map.getZoom).toHaveBeenCalled();
    expect(map.getBearing).toHaveBeenCalled();
    expect(map.getPitch).toHaveBeenCalled();
    expect(maplibreToCesiumCamera).toHaveBeenCalledWith(
      { lng: 17.2, lat: 48.1 },
      14,
      0,
      0,
      800,
    );
    expect(viewer.camera.setView).toHaveBeenCalledWith({
      destination: { x: 1, y: 2, z: 3 },
      orientation: { heading: 0, pitch: -1.57, roll: 0 },
    });
  });

  it("syncToCesium is throttled within 100ms", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    nowSpy.mockReturnValue(1000);
    result.current.syncToCesium(viewer as never);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);

    // second call at 1050ms - within 100ms window
    nowSpy.mockReturnValue(1050);
    result.current.syncToCesium(viewer as never);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);
  });

  it("syncToCesium fires again after 100ms", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    nowSpy.mockReturnValue(1000);
    result.current.syncToCesium(viewer as never);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);

    // second call at 1200ms - past 100ms window
    nowSpy.mockReturnValue(1200);
    result.current.syncToCesium(viewer as never);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(2);
  });

  it("syncToMaplibre does nothing when mapRef.current is null", () => {
    const mapRef = { current: null };
    const { result } = renderHook(() => useCesiumSync(mapRef));
    const viewer = createMockViewer();

    result.current.syncToMaplibre(viewer as never);

    expect(cesiumToMaplibreCamera).not.toHaveBeenCalled();
  });

  it("syncToMaplibre reads camera and calls map.jumpTo", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    result.current.syncToMaplibre(viewer as never);

    expect(cesiumToMaplibreCamera).toHaveBeenCalledWith(
      viewer.camera.position,
      viewer.camera.heading,
      viewer.camera.pitch,
      800,
    );
    expect(map.jumpTo).toHaveBeenCalledWith({
      center: [17.2, 48.1],
      zoom: 14,
      bearing: 0,
      pitch: 0,
    });
  });

  it("syncToMaplibre is throttled within 100ms", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    nowSpy.mockReturnValue(1000);
    result.current.syncToMaplibre(viewer as never);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1050);
    result.current.syncToMaplibre(viewer as never);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
  });

  it("syncToMaplibre fires again after 100ms", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    nowSpy.mockReturnValue(1000);
    result.current.syncToMaplibre(viewer as never);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1200);
    result.current.syncToMaplibre(viewer as never);
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
  });

  it("syncToCesium and syncToMaplibre throttle independently", () => {
    const map = createMockMap();
    const mapRef = { current: map };
    const { result } = renderHook(() => useCesiumSync(mapRef as never));
    const viewer = createMockViewer();

    // syncToCesium at T=1000
    nowSpy.mockReturnValue(1000);
    result.current.syncToCesium(viewer as never);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);

    // syncToMaplibre at T=1050 - should fire since it uses a separate throttle ref
    nowSpy.mockReturnValue(1050);
    result.current.syncToMaplibre(viewer as never);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
  });
});
