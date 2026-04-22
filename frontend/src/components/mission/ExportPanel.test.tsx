import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ExportPanel, { type ExportPanelProps } from "./ExportPanel";
import type { MissionDetailResponse } from "@/types/mission";

function makeMission(
  overrides: Partial<MissionDetailResponse> = {},
): MissionDetailResponse {
  return {
    id: "m-1",
    name: "Test Mission",
    status: "VALIDATED",
    airport_id: "apt-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    operator_notes: null,
    drone_profile_id: null,
    date_time: null,
    default_speed: null,
    measurement_speed_override: null,
    default_altitude_offset: null,
    takeoff_coordinate: null,
    landing_coordinate: null,
    default_capture_mode: null,
    default_buffer_distance: null,
    default_white_balance: null,
    default_iso: null,
    default_shutter_speed: null,
    default_focus_mode: null,
    camera_mode: "AUTO",
    transit_agl: null,
    require_perpendicular_runway_crossing: false,
    flight_plan_scope: "FULL",
    boundary_constraint_mode: "NONE",
    boundary_preference: "DONT_CARE",
    has_unsaved_map_changes: false,
    computation_status: "IDLE",
    computation_error: null,
    computation_started_at: null,
    inspection_count: 0,
    estimated_duration: null,
    inspections: [],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ExportPanelProps> = {}) {
  const defaults: ExportPanelProps = {
    mission: makeMission(),
    onExport: vi.fn(),
    onComplete: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    isExporting: false,
    hasFlightPlan: true,
    onDownloadReport: vi.fn(),
    isDownloadingReport: false,
    ...overrides,
  };
  return { ...render(<ExportPanel {...defaults} />), props: defaults };
}

describe("ExportPanel - mission report section", () => {
  it("renders the mission report download button when mission has a flight plan", () => {
    renderPanel({ hasFlightPlan: true });

    const btn = screen.getByTestId("download-report-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("disables the mission report button when there is no flight plan", () => {
    renderPanel({ hasFlightPlan: false });

    const btn = screen.getByTestId("download-report-btn");
    expect(btn).toBeDisabled();
  });

  it("calls onDownloadReport when the button is clicked", () => {
    const onDownloadReport = vi.fn();
    renderPanel({ onDownloadReport, hasFlightPlan: true });

    fireEvent.click(screen.getByTestId("download-report-btn"));
    expect(onDownloadReport).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when isDownloadingReport is true", () => {
    renderPanel({ isDownloadingReport: true, hasFlightPlan: true });

    const btn = screen.getByTestId("download-report-btn");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("mission.missionReport.generating");
  });

  it("renders report section for DRAFT status missions", () => {
    renderPanel({
      mission: makeMission({ status: "DRAFT" }),
      hasFlightPlan: true,
    });

    expect(screen.getByTestId("mission-report-section")).toBeInTheDocument();
  });
});
