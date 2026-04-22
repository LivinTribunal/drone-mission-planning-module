import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WaypointListPanel from "./WaypointListPanel";
import type { WaypointResponse } from "@/types/flightPlan";

function wp(overrides: Partial<WaypointResponse> = {}): WaypointResponse {
  return {
    id: "wp1",
    mission_id: "m1",
    inspection_id: null,
    waypoint_type: "MEASUREMENT",
    sequence_order: 1,
    position: { type: "Point", coordinates: [14.5, 50.1, 100] },
    heading: 0,
    speed: 5,
    camera_action: null,
    camera_target: null,
    gimbal_pitch: 0,
    hover_duration: null,
    ...overrides,
  } as WaypointResponse;
}

describe("WaypointListPanel click behavior", () => {
  it("single-click calls onSelect and does NOT call onLocate", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    render(
      <WaypointListPanel
        waypoints={[wp({ id: "wp-a", sequence_order: 1 })]}
        selectedId={null}
        onSelect={onSelect}
        onLocate={onLocate}
      />,
    );

    const row = screen.getByTestId("waypoint-item-wp-a");
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("wp-a");
    expect(onLocate).not.toHaveBeenCalled();
  });

  it("double-click invokes onLocate", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    render(
      <WaypointListPanel
        waypoints={[wp({ id: "wp-a", sequence_order: 1 })]}
        selectedId={null}
        onSelect={onSelect}
        onLocate={onLocate}
      />,
    );

    const row = screen.getByTestId("waypoint-item-wp-a");
    fireEvent.doubleClick(row);

    expect(onLocate).toHaveBeenCalledTimes(1);
    expect(onLocate).toHaveBeenCalledWith("wp-a");
  });

  it("single-click on standalone takeoff calls onSelect only", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    render(
      <WaypointListPanel
        waypoints={[]}
        selectedId={null}
        onSelect={onSelect}
        onLocate={onLocate}
        takeoffCoordinate={{ type: "Point", coordinates: [14.5, 50.1, 0] }}
      />,
    );

    const row = screen.getByTestId("waypoint-item-takeoff");
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith("takeoff");
    expect(onLocate).not.toHaveBeenCalled();
  });

  it("double-click on standalone takeoff invokes onLocate", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    render(
      <WaypointListPanel
        waypoints={[]}
        selectedId={null}
        onSelect={onSelect}
        onLocate={onLocate}
        takeoffCoordinate={{ type: "Point", coordinates: [14.5, 50.1, 0] }}
      />,
    );

    const row = screen.getByTestId("waypoint-item-takeoff");
    fireEvent.doubleClick(row);

    expect(onLocate).toHaveBeenCalledWith("takeoff");
  });
});
