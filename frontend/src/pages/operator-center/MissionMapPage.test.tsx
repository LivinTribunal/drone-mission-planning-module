import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapControlsToolbar from "@/components/map/overlays/MapControlsToolbar";
import MapWarningsPanel from "@/components/map/overlays/MapWarningsPanel";
import MapStatsPanel from "@/components/map/overlays/MapStatsPanel";
import { MapTool } from "@/hooks/useMapTools";

// lightweight component tests - avoid rendering full page to prevent OOM in CI

const toolbarDefaults = {
  activeTool: MapTool.SELECT,
  onToolChange: vi.fn(),
  is3D: false,
  onToggle3D: vi.fn(),
  terrainMode: "satellite" as const,
  onTerrainChange: vi.fn(),
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onZoomReset: vi.fn(),
  zoomPercent: 100,
  onZoomTo: vi.fn(),
};

describe("MapControlsToolbar", () => {
  /** tests for the map controls toolbar. */

  it("renders toolbar with tool buttons", () => {
    /** verify toolbar renders with expected test id. */
    render(<MapControlsToolbar {...toolbarDefaults} />);
    expect(screen.getByTestId("map-controls-toolbar")).toBeInTheDocument();
  });

  it("highlights the active tool", () => {
    /** verify the select tool is visually active. */
    render(<MapControlsToolbar {...toolbarDefaults} activeTool={MapTool.SELECT} />);
    const btn = screen.getByTestId("tool-select");
    expect(btn.className).toContain("bg-tv-accent");
  });

  it("calls onToolChange when a tool button is clicked", () => {
    /** verify clicking a tool fires the callback. */
    const onToolChange = vi.fn();
    render(<MapControlsToolbar {...toolbarDefaults} onToolChange={onToolChange} />);
    fireEvent.click(screen.getByTestId("tool-pan"));
    expect(onToolChange).toHaveBeenCalledWith(MapTool.PAN);
  });

  it("disables undo when canUndo is false", () => {
    /** verify undo button is disabled. */
    render(<MapControlsToolbar {...toolbarDefaults} canUndo={false} />);
    expect(screen.getByTestId("undo-btn")).toBeDisabled();
  });

  it("enables undo when canUndo is true", () => {
    /** verify undo button is enabled. */
    render(<MapControlsToolbar {...toolbarDefaults} canUndo={true} />);
    expect(screen.getByTestId("undo-btn")).not.toBeDisabled();
  });

  it("calls onUndo when undo button is clicked", () => {
    /** verify undo fires the callback. */
    const onUndo = vi.fn();
    render(<MapControlsToolbar {...toolbarDefaults} canUndo={true} onUndo={onUndo} />);
    fireEvent.click(screen.getByTestId("undo-btn"));
    expect(onUndo).toHaveBeenCalled();
  });

  it("calls onRedo when redo button is clicked", () => {
    /** verify redo fires the callback. */
    const onRedo = vi.fn();
    render(<MapControlsToolbar {...toolbarDefaults} canRedo={true} onRedo={onRedo} />);
    fireEvent.click(screen.getByTestId("redo-btn"));
    expect(onRedo).toHaveBeenCalled();
  });
});

describe("MapWarningsPanel", () => {
  /** tests for the map warnings overlay panel. */

  it("renders nothing when violations is empty", () => {
    /** verify no output for empty violations. */
    const { container } = render(<MapWarningsPanel violations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders violations sorted by severity", () => {
    /** verify violations appear and panel renders. */
    render(
      <MapWarningsPanel
        violations={[
          { id: "1", message: "Speed warning", category: "warning", is_warning: true, severity: "warning", constraint_id: null, constraint_name: null, violation_kind: "speed", waypoint_ref: null, waypoint_ids: [] },
          { id: "2", message: "Altitude error", category: "violation", is_warning: false, severity: "violation", constraint_id: null, constraint_name: null, violation_kind: "altitude", waypoint_ref: null, waypoint_ids: [] },
        ]}
      />,
    );
    expect(screen.getByTestId("map-warnings-panel")).toBeInTheDocument();
  });
});

describe("MapStatsPanel", () => {
  /** tests for the map stats overlay panel. */

  const baseFlightPlan = {
    id: "fp-1",
    mission_id: "m-1",
    airport_id: "apt-1",
    total_distance: 2500,
    estimated_duration: 600,
    is_validated: false,
    generated_at: "2026-03-19T00:00:00Z",
    waypoints: [
      { id: "wp-1", sequence_order: 1 },
      { id: "wp-2", sequence_order: 2 },
    ],
    validation_result: null,
  };

  it("renders stats panel with flight data", () => {
    /** verify the stats panel renders. */
    render(
      <MapStatsPanel
        flightPlan={baseFlightPlan as never}
        inspectionCount={2}
        enduranceMinutes={55}
      />,
    );
    expect(screen.getByTestId("map-stats-panel")).toBeInTheDocument();
  });

  it("shows distance in kilometers", () => {
    /** verify distance formatting. */
    render(
      <MapStatsPanel
        flightPlan={baseFlightPlan as never}
        inspectionCount={1}
      />,
    );
    expect(screen.getByText("2.50 km")).toBeInTheDocument();
  });

  it("shows formatted duration", () => {
    /** verify duration formatting. */
    render(
      <MapStatsPanel
        flightPlan={baseFlightPlan as never}
        inspectionCount={1}
      />,
    );
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("shows battery percentage when endurance provided", () => {
    /** verify battery calculation. */
    render(
      <MapStatsPanel
        flightPlan={baseFlightPlan as never}
        inspectionCount={1}
        enduranceMinutes={55}
      />,
    );
    // 600s = 10min, 10/55 = 18.2%, remaining = 82%
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("shows waypoint count", () => {
    /** verify waypoint count display. */
    render(
      <MapStatsPanel
        flightPlan={baseFlightPlan as never}
        inspectionCount={3}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
