import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ExportPanel, { type ExportPanelProps } from "./ExportPanel";
import type { MissionDetailResponse } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";

function makeDrone(
  overrides: Partial<DroneProfileResponse> = {},
): DroneProfileResponse {
  return {
    id: "drone-1",
    name: "Test Drone",
    manufacturer: null,
    model: null,
    max_speed: null,
    max_climb_rate: null,
    max_altitude: null,
    battery_capacity: null,
    endurance_minutes: null,
    camera_resolution: null,
    camera_frame_rate: null,
    sensor_fov: null,
    weight: null,
    model_identifier: null,
    max_optical_zoom: null,
    supports_geozone_upload: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    mission_count: 0,
    ...overrides,
  };
}

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

describe("ExportPanel - geozones gate", () => {
  it("disables the geozones checkbox when no drone profile is attached", () => {
    renderPanel({ droneProfile: null });

    const cb = screen.getByTestId("include-geozones-checkbox") as HTMLInputElement;
    expect(cb).toBeDisabled();
    expect(cb.checked).toBe(false);
  });

  it("disables the geozones checkbox when drone lacks the capability", () => {
    renderPanel({ droneProfile: makeDrone({ supports_geozone_upload: false }) });

    const cb = screen.getByTestId("include-geozones-checkbox") as HTMLInputElement;
    expect(cb).toBeDisabled();
  });

  it("disables the geozones checkbox when no selected format supports zones", () => {
    const { container } = renderPanel({
      droneProfile: makeDrone({ supports_geozone_upload: true }),
    });

    // default selection is KML (capable). turn it off, turn on GPX (incapable).
    fireEvent.click(screen.getByTestId("format-KML"));
    fireEvent.click(screen.getByTestId("format-GPX"));

    const cb = screen.getByTestId("include-geozones-checkbox") as HTMLInputElement;
    expect(cb).toBeDisabled();
    // tooltip explains which branch of the gate rejected the combo
    const label = container.querySelector('[data-testid="geozones-section"] label');
    expect(label?.getAttribute("title")).toContain("tooltipUnsupportedFormat");
  });

  it("enables the geozones checkbox when a capable format + capable drone combine", () => {
    renderPanel({
      droneProfile: makeDrone({ supports_geozone_upload: true }),
    });

    // default selection is KML which is geozone-capable
    const cb = screen.getByTestId("include-geozones-checkbox") as HTMLInputElement;
    expect(cb).not.toBeDisabled();
  });

  it("passes include_geozones and include_runway_buffers up through onExport", () => {
    const onExport = vi.fn();
    renderPanel({
      onExport,
      droneProfile: makeDrone({ supports_geozone_upload: true }),
    });

    // turn off KML, turn on MAVLINK (enforced + supports runway buffers)
    fireEvent.click(screen.getByTestId("format-KML"));
    fireEvent.click(screen.getByTestId("format-MAVLINK"));

    // opt in to geozones + runway buffers
    fireEvent.click(screen.getByTestId("include-geozones-checkbox"));
    fireEvent.click(screen.getByTestId("include-runway-buffers-checkbox"));

    fireEvent.click(screen.getByTestId("download-export-btn"));

    expect(onExport).toHaveBeenCalledWith(["MAVLINK"], {
      includeGeozones: true,
      includeRunwayBuffers: true,
    });
  });

  it("does not forward include_geozones=true when the gate is closed", () => {
    const onExport = vi.fn();
    renderPanel({
      onExport,
      droneProfile: makeDrone({ supports_geozone_upload: false }),
    });

    fireEvent.click(screen.getByTestId("download-export-btn"));

    expect(onExport).toHaveBeenCalledWith(["KML"], {
      includeGeozones: false,
      includeRunwayBuffers: false,
    });
  });

  it("shows the advisory note for KML/KMZ and the enforced note for MAVLINK/JSON/UGCS", () => {
    renderPanel({
      droneProfile: makeDrone({ supports_geozone_upload: true }),
    });

    // KML alone: advisory only
    fireEvent.click(screen.getByTestId("include-geozones-checkbox"));
    expect(screen.queryByTestId("geozones-advisory-note")).toBeInTheDocument();
    expect(screen.queryByTestId("geozones-enforced-note")).not.toBeInTheDocument();

    // add JSON: enforced note appears alongside advisory
    fireEvent.click(screen.getByTestId("format-JSON"));
    expect(screen.queryByTestId("geozones-advisory-note")).toBeInTheDocument();
    expect(screen.queryByTestId("geozones-enforced-note")).toBeInTheDocument();
  });
});
