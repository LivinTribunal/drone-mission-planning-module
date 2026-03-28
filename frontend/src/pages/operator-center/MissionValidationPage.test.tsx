import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ValidationResultsPanel from "@/components/mission/ValidationResultsPanel";
import ExportPanel from "@/components/mission/ExportPanel";
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { MissionDetailResponse } from "@/types/mission";

// mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-id" }),
  useNavigate: () => vi.fn(),
  useOutletContext: () => ({
    setSaveContext: vi.fn(),
    setComputeContext: vi.fn(),
    refreshMissions: vi.fn(),
  }),
}));

function makeMission(
  status: string = "DRAFT",
): MissionDetailResponse {
  return {
    id: "test-id",
    name: "Test Mission",
    status: status as MissionDetailResponse["status"],
    airport_id: "airport-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    operator_notes: null,
    drone_profile_id: null,
    date_time: null,
    default_speed: null,
    default_altitude_offset: null,
    takeoff_coordinate: null,
    landing_coordinate: null,
    has_unsaved_map_changes: false,
    inspection_count: 0,
    estimated_duration: null,
    inspections: [],
  };
}

function makeFlightPlan(passed: boolean = true): FlightPlanResponse {
  return {
    id: "fp-1",
    mission_id: "test-id",
    airport_id: "airport-1",
    total_distance: 100,
    estimated_duration: 60,
    is_validated: true,
    generated_at: "2026-01-01T00:00:00Z",
    waypoints: [],
    validation_result: {
      id: "vr-1",
      passed,
      validated_at: "2026-01-01T00:00:00Z",
      violations: passed
        ? []
        : [
            {
              id: "v1",
              category: "violation",
              is_warning: false,
              severity: "violation",
              message: "altitude violation detected",
              constraint_id: null,
              constraint_name: null,
              violation_kind: "altitude",
              waypoint_ref: null,
            },
            {
              id: "v2",
              category: "warning",
              is_warning: true,
              severity: "warning",
              message: "battery reserve warning",
              constraint_id: null,
              constraint_name: null,
              violation_kind: "battery",
              waypoint_ref: null,
            },
          ],
    },
  };
}

describe("ValidationResultsPanel", () => {
  const defaultProps = {
    onValidate: vi.fn(),
    onNavigateConfig: vi.fn(),
    isValidating: false,
  };

  it("shows no-data message when flight plan is null", () => {
    render(
      <ValidationResultsPanel
        flightPlan={null}
        missionStatus="DRAFT"
        {...defaultProps}
      />,
    );
    expect(
      screen.getByText("mission.validationExportPage.noData"),
    ).toBeInTheDocument();
  });

  it("shows constraint rows when flight plan exists", () => {
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(true)}
        missionStatus="PLANNED"
        {...defaultProps}
      />,
    );
    expect(
      screen.getByTestId("constraint-altitudeCheck"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("constraint-speedCheck"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("constraint-batteryCheck"),
    ).toBeInTheDocument();
  });

  it("shows PASSED badge when validation passes and mission is validated", () => {
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(true)}
        missionStatus="VALIDATED"
        {...defaultProps}
      />,
    );
    expect(screen.getByText("mission.validationExportPage.passed")).toBeInTheDocument();
  });

  it("shows FAILED badge when violations exist", () => {
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(false)}
        missionStatus="PLANNED"
        {...defaultProps}
      />,
    );
    expect(screen.getByText("mission.validationExportPage.failed")).toBeInTheDocument();
  });

  it("shows no badge when no trajectory", () => {
    render(
      <ValidationResultsPanel
        flightPlan={null}
        missionStatus="DRAFT"
        {...defaultProps}
      />,
    );
    expect(screen.queryByText("mission.validationExportPage.passed")).not.toBeInTheDocument();
    expect(screen.queryByText("mission.validationExportPage.failed")).not.toBeInTheDocument();
  });

  it("accept button disabled when not PLANNED", () => {
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(true)}
        missionStatus="DRAFT"
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("accept-btn")).toBeDisabled();
  });

  it("accept button enabled when PLANNED", () => {
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(true)}
        missionStatus="PLANNED"
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("accept-btn")).not.toBeDisabled();
  });

  it("calls onValidate when accept is clicked", () => {
    const onValidate = vi.fn();
    render(
      <ValidationResultsPanel
        flightPlan={makeFlightPlan(true)}
        missionStatus="PLANNED"
        onValidate={onValidate}
        onNavigateConfig={vi.fn()}
        isValidating={false}
      />,
    );
    fireEvent.click(screen.getByTestId("accept-btn"));
    expect(onValidate).toHaveBeenCalled();
  });
});

describe("ExportPanel", () => {
  let defaultProps: {
    mission: MissionDetailResponse;
    onExport: ReturnType<typeof vi.fn>;
    onComplete: ReturnType<typeof vi.fn>;
    onCancel: ReturnType<typeof vi.fn>;
    onDelete: ReturnType<typeof vi.fn>;
    isExporting: boolean;
  };

  beforeEach(() => {
    defaultProps = {
      mission: makeMission("VALIDATED"),
      onExport: vi.fn(),
      onComplete: vi.fn(),
      onCancel: vi.fn(),
      onDelete: vi.fn(),
      isExporting: false,
    };
  });

  it("renders format checkboxes", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByTestId("format-KML")).toBeInTheDocument();
    expect(screen.getByTestId("format-KMZ")).toBeInTheDocument();
    expect(screen.getByTestId("format-JSON")).toBeInTheDocument();
    expect(screen.getByTestId("format-MAVLINK")).toBeInTheDocument();
  });

  it("download button enabled for VALIDATED status", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByTestId("download-export-btn")).not.toBeDisabled();
  });

  it("download button disabled for DRAFT status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("DRAFT")} />,
    );
    expect(screen.getByTestId("download-export-btn")).toBeDisabled();
  });

  it("checkboxes disabled for DRAFT status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("DRAFT")} />,
    );
    expect(screen.getByTestId("format-KML")).toBeDisabled();
  });

  it("checkboxes enabled for VALIDATED status", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByTestId("format-KML")).not.toBeDisabled();
  });

  it("complete button disabled for VALIDATED status", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByTestId("complete-btn")).toBeDisabled();
  });

  it("complete button enabled for EXPORTED status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("EXPORTED")} />,
    );
    expect(screen.getByTestId("complete-btn")).not.toBeDisabled();
  });

  it("cancel button disabled for VALIDATED status", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByTestId("cancel-mission-btn")).toBeDisabled();
  });

  it("cancel button enabled for EXPORTED status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("EXPORTED")} />,
    );
    expect(screen.getByTestId("cancel-mission-btn")).not.toBeDisabled();
  });

  it("delete button enabled for DRAFT status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("DRAFT")} />,
    );
    expect(screen.getByTestId("delete-btn")).not.toBeDisabled();
  });

  it("delete button disabled for EXPORTED status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("EXPORTED")} />,
    );
    expect(screen.getByTestId("delete-btn")).toBeDisabled();
  });

  it("delete button disabled for COMPLETED status", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("COMPLETED")} />,
    );
    expect(screen.getByTestId("delete-btn")).toBeDisabled();
  });

  it("all lifecycle buttons disabled for terminal states", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("COMPLETED")} />,
    );
    expect(screen.getByTestId("complete-btn")).toBeDisabled();
    expect(screen.getByTestId("cancel-mission-btn")).toBeDisabled();
    expect(screen.getByTestId("delete-btn")).toBeDisabled();
  });

  it("shows confirmation modal on delete click", () => {
    render(
      <ExportPanel {...defaultProps} mission={makeMission("DRAFT")} />,
    );
    fireEvent.click(screen.getByTestId("delete-btn"));
    expect(
      screen.getByText(
        "mission.validationExportPage.deleteConfirmMessage",
      ),
    ).toBeInTheDocument();
  });

  it("calls onExport with selected formats on download", () => {
    render(<ExportPanel {...defaultProps} />);

    // KML is selected by default, also select JSON
    fireEvent.click(screen.getByTestId("format-JSON"));
    fireEvent.click(screen.getByTestId("download-export-btn"));

    expect(defaultProps.onExport).toHaveBeenCalledWith(
      expect.arrayContaining(["KML", "JSON"]),
    );
  });
});
