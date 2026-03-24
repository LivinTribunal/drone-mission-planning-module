import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InspectionSelect from "./InspectionSelect";
import MapControlsToolbar from "./MapControlsToolbar";
import MapWarningsPanel from "./MapWarningsPanel";
import MapStatsPanel from "./MapStatsPanel";
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
    method: "ANGULAR_SWEEP",
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

describe("InspectionSelect", () => {
  it("renders dropdown with inspections", () => {
    render(
      <InspectionSelect
        inspections={mockInspections}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("inspection-select")).toBeInTheDocument();
    expect(screen.getByText("map.inspectionSelect")).toBeInTheDocument();
  });

  it("calls onSelect when inspection is chosen", () => {
    const onSelect = vi.fn();
    render(
      <InspectionSelect
        inspections={mockInspections}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "insp-1" } });
    expect(onSelect).toHaveBeenCalledWith("insp-1");
  });

  it("calls onSelect with null when none is selected", () => {
    const onSelect = vi.fn();
    render(
      <InspectionSelect
        inspections={mockInspections}
        selectedId="insp-1"
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("MapControlsToolbar", () => {
  const defaultProps = {
    activeTool: MapTool.PAN,
    onToolChange: vi.fn(),
    is3D: false,
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    inspectionSelected: false,
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

  it("disables waypoint and camera tools when no inspection selected", () => {
    render(<MapControlsToolbar {...defaultProps} inspectionSelected={false} />);
    expect(screen.getByTestId("tool-waypoint")).toBeDisabled();
    expect(screen.getByTestId("tool-camera")).toBeDisabled();
  });

  it("enables waypoint and camera tools when inspection selected", () => {
    render(<MapControlsToolbar {...defaultProps} inspectionSelected={true} />);
    expect(screen.getByTestId("tool-waypoint")).not.toBeDisabled();
    expect(screen.getByTestId("tool-camera")).not.toBeDisabled();
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
        is_warning: true,
        message: "speed too fast",
        constraint_id: null,
        violation_kind: "speed",
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
