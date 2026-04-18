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
    transit_agl: null,
    require_perpendicular_runway_crossing: false,
    flight_plan_scope: "FULL",
    has_unsaved_map_changes: false,
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
    onDownloadBrief: vi.fn(),
    isDownloadingBrief: false,
    ...overrides,
  };
  return { ...render(<ExportPanel {...defaults} />), props: defaults };
}

describe("ExportPanel - flight brief section", () => {
  it("renders the flight brief download button when mission has a flight plan", () => {
    renderPanel({ hasFlightPlan: true });

    const btn = screen.getByTestId("download-brief-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("disables the flight brief button when there is no flight plan", () => {
    renderPanel({ hasFlightPlan: false });

    const btn = screen.getByTestId("download-brief-btn");
    expect(btn).toBeDisabled();
  });

  it("calls onDownloadBrief when the button is clicked", () => {
    const onDownloadBrief = vi.fn();
    renderPanel({ onDownloadBrief, hasFlightPlan: true });

    fireEvent.click(screen.getByTestId("download-brief-btn"));
    expect(onDownloadBrief).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when isDownloadingBrief is true", () => {
    renderPanel({ isDownloadingBrief: true, hasFlightPlan: true });

    const btn = screen.getByTestId("download-brief-btn");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("mission.flightBrief.generating");
  });

  it("renders brief section for DRAFT status missions", () => {
    renderPanel({
      mission: makeMission({ status: "DRAFT" }),
      hasFlightPlan: true,
    });

    expect(screen.getByTestId("flight-brief-section")).toBeInTheDocument();
  });
});
