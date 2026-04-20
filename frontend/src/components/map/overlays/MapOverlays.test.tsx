import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapControlsToolbar from "./MapControlsToolbar";
import MapWarningsPanel from "./MapWarningsPanel";
import MapStatsPanel from "./MapStatsPanel";
import InspectionListPanel from "./InspectionListPanel";
import { MapTool } from "@/hooks/useMapTools";
import type { InspectionResponse } from "@/types/mission";
import type { ValidationViolation } from "@/types/flightPlan";
import type { FlightPlanResponse } from "@/types/flightPlan";

const mockInspections: InspectionResponse[] = [
  {
    id: "insp-1",
    mission_id: "m-1",
    template_id: "t-1",
    config_id: null,
    method: "HORIZONTAL_RANGE",
    sequence_order: 1,
    lha_ids: null,
    config: null,
  },
  {
    id: "insp-2",
    mission_id: "m-1",
    template_id: "t-2",
    config_id: null,
    method: "VERTICAL_PROFILE",
    sequence_order: 2,
    lha_ids: null,
    config: null,
  },
];

describe("InspectionListPanel", () => {
  it("renders inspection list", () => {
    render(
      <InspectionListPanel
        inspections={mockInspections}
        hiddenInspectionIds={new Set()}
        onToggleVisibility={vi.fn()}
        onInspectionClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("inspection-list-panel")).toBeInTheDocument();
  });

  it("calls onInspectionClick when inspection is clicked", () => {
    const onClick = vi.fn();
    render(
      <InspectionListPanel
        inspections={mockInspections}
        hiddenInspectionIds={new Set()}
        onToggleVisibility={vi.fn()}
        onInspectionClick={onClick}
      />,
    );
    fireEvent.click(screen.getByTestId("inspection-item-insp-1"));
    expect(onClick).toHaveBeenCalledWith("insp-1");
  });

  it("calls onToggleVisibility when eye icon is clicked", () => {
    const onToggle = vi.fn();
    render(
      <InspectionListPanel
        inspections={mockInspections}
        hiddenInspectionIds={new Set()}
        onToggleVisibility={onToggle}
        onInspectionClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("toggle-visibility-insp-1"));
    expect(onToggle).toHaveBeenCalledWith("insp-1");
  });
});

describe("MapControlsToolbar", () => {
  const defaultProps = {
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

  it("renders toolbar with tool buttons", () => {
    render(<MapControlsToolbar {...defaultProps} />);
    expect(screen.getByTestId("map-controls-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("tool-pan")).toBeInTheDocument();
    expect(screen.getByTestId("tool-select")).toBeInTheDocument();
  });

  it("calls onToolChange when tool is clicked", () => {
    const onToolChange = vi.fn();
    render(<MapControlsToolbar {...defaultProps} onToolChange={onToolChange} />);
    fireEvent.click(screen.getByTestId("tool-select"));
    expect(onToolChange).toHaveBeenCalledWith(MapTool.SELECT);
  });

  it("disables undo button when canUndo is false", () => {
    render(<MapControlsToolbar {...defaultProps} canUndo={false} />);
    expect(screen.getByTestId("undo-btn")).toBeDisabled();
  });

  it("enables undo button when canUndo is true", () => {
    render(<MapControlsToolbar {...defaultProps} canUndo={true} />);
    expect(screen.getByTestId("undo-btn")).not.toBeDisabled();
  });
});

describe("MapWarningsPanel", () => {
  it("renders nothing when no violations", () => {
    const { container } = render(<MapWarningsPanel violations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders warnings when violations exist", () => {
    const violations: ValidationViolation[] = [
      {
        id: "v-1",
        category: "warning",
        is_warning: true,
        severity: "warning",
        message: "speed too fast",
        constraint_id: null,
        constraint_name: null,
        violation_kind: "speed",
        waypoint_ref: null,
        waypoint_ids: [],
      },
    ];
    render(<MapWarningsPanel violations={violations} />);
    expect(screen.getByTestId("map-warnings-panel")).toBeInTheDocument();
    expect(screen.getByText("speed too fast")).toBeInTheDocument();
  });
});

describe("MapStatsPanel", () => {
  const mockFlightPlan: FlightPlanResponse = {
    id: "fp-1",
    mission_id: "m-1",
    airport_id: "a-1",
    total_distance: 5000,
    estimated_duration: 300,
    is_validated: true,
    generated_at: "2026-01-01T00:00:00Z",
    waypoints: [],
    validation_result: null,
    min_altitude_agl: null,
    max_altitude_agl: null,
    min_altitude_msl: null,
    max_altitude_msl: null,
    transit_speed: null,
    average_speed: null,
    inspection_stats: [],
  };

  it("renders stats panel with flight plan data", () => {
    render(
      <MapStatsPanel
        flightPlan={mockFlightPlan}
        inspectionCount={3}
        enduranceMinutes={55}
      />,
    );
    expect(screen.getByTestId("map-stats-panel")).toBeInTheDocument();
    expect(screen.getByText("5.00 km")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
