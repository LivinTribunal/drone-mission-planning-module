import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CoordinateInput from "@/components/mission/CoordinateInput";
import InspectionConfigForm from "@/components/mission/InspectionConfigForm";
import WarningsPanel from "@/components/mission/WarningsPanel";
import StatsPanel from "@/components/mission/StatsPanel";
import WaypointInfoPanel from "@/components/map/overlays/WaypointInfoPanel";

// lightweight component tests - avoid rendering full page to prevent OOM in CI

describe("CoordinateInput", () => {
  it("renders three input fields for lat, lon, alt", () => {
    const onChange = vi.fn();
    render(
      <CoordinateInput label="Takeoff" value={null} onChange={onChange} />,
    );

    expect(screen.getByTestId("takeoff-lat")).toBeInTheDocument();
    expect(screen.getByTestId("takeoff-lon")).toBeInTheDocument();
    expect(screen.getByTestId("takeoff-alt")).toBeInTheDocument();
  });

  it("shows validation error for out-of-range latitude", () => {
    const onChange = vi.fn();
    render(
      <CoordinateInput
        label="Takeoff"
        value={{ type: "Point", coordinates: [17.21, 95, 133] }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("mission.config.latRange")).toBeInTheDocument();
  });

  it("shows validation error for out-of-range longitude", () => {
    const onChange = vi.fn();
    render(
      <CoordinateInput
        label="Landing"
        value={{ type: "Point", coordinates: [200, 48.17, 133] }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("mission.config.lonRange")).toBeInTheDocument();
  });

  it("calls onChange when latitude is updated", () => {
    const onChange = vi.fn();
    render(
      <CoordinateInput
        label="Takeoff"
        value={{ type: "Point", coordinates: [17.21, 48.17, 133] }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("takeoff-lat"), {
      target: { value: "49" },
    });

    expect(onChange).toHaveBeenCalledWith({
      type: "Point",
      coordinates: [17.21, 49, 133],
    });
  });
});

describe("WarningsPanel", () => {
  it("shows pre-trajectory message when no trajectory exists", () => {
    render(<WarningsPanel warnings={null} hasTrajectory={false} />);
    expect(
      screen.getByText("mission.config.computeToSeeWarnings"),
    ).toBeInTheDocument();
  });

  it("shows no warnings message after trajectory with empty warnings", () => {
    render(<WarningsPanel warnings={[]} hasTrajectory={true} />);
    expect(
      screen.getByText("mission.config.noWarnings"),
    ).toBeInTheDocument();
  });

  it("shows warning messages after trajectory", () => {
    render(
      <WarningsPanel
        warnings={[{ id: "1", message: "Speed too high", category: "warning", is_warning: true, severity: "warning", constraint_id: null, constraint_name: null, violation_kind: "speed", waypoint_ref: null, waypoint_ids: [] }, { id: "2", message: "Altitude violation", category: "warning", is_warning: true, severity: "warning", constraint_id: null, constraint_name: null, violation_kind: "altitude", waypoint_ref: null, waypoint_ids: [] }]}
        hasTrajectory={true}
      />,
    );
    expect(screen.getByText("Speed too high")).toBeInTheDocument();
    expect(screen.getByText("Altitude violation")).toBeInTheDocument();
  });
});

describe("StatsPanel", () => {
  it("shows pre-trajectory message when no trajectory exists", () => {
    render(
      <StatsPanel
        flightPlan={null}
        hasTrajectory={false}

        droneProfile={null}
      />,
    );
    expect(
      screen.getByText("mission.config.computeToSeeStats"),
    ).toBeInTheDocument();
  });

  it("shows flight plan stats after trajectory", () => {
    render(
      <StatsPanel
        flightPlan={{
          id: "fp-1",
          mission_id: "m-1",
          airport_id: "apt-1",
          total_distance: 1500,
          estimated_duration: 300,
          is_validated: false,
          generated_at: "2026-03-19T00:00:00Z",
          waypoints: [],
          validation_result: null,
        }}
        hasTrajectory={true}

        droneProfile={{
          id: "dp-1",
          name: "DJI",
          manufacturer: null,
          model: null,
          max_speed: null,
          max_climb_rate: null,
          max_altitude: null,
          battery_capacity: null,
          endurance_minutes: 55,
          camera_resolution: null,
          camera_frame_rate: null,
          sensor_fov: null,
          weight: null,
          model_identifier: null,
          created_at: "2026-03-19T00:00:00Z",
          updated_at: "2026-03-19T00:00:00Z",
          mission_count: 0,
        }}
      />,
    );

    expect(screen.getByText("1.50 km")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });
});

describe("InspectionConfigForm LHA toggle", () => {
  const mockAgl = {
    id: "agl-1",
    surface_id: "srf-1",
    agl_type: "PAPI" as const,
    name: "PAPI 09L",
    position: { type: "Point" as const, coordinates: [17.21, 48.17, 133] as [number, number, number] },
    side: null,
    glide_slope_angle: null,
    distance_from_threshold: null,
    offset_from_centerline: null,
    lhas: [
      {
        id: "lha-1",
        agl_id: "agl-1",
        unit_designator: "A",
        setting_angle: 3.0,
        transition_sector_width: null,
        lamp_type: "HALOGEN" as const,
        position: { type: "Point" as const, coordinates: [17.21, 48.17, 133] as [number, number, number] },
        tolerance: null,
      },
      {
        id: "lha-2",
        agl_id: "agl-1",
        unit_designator: "B",
        setting_angle: 3.5,
        transition_sector_width: null,
        lamp_type: "HALOGEN" as const,
        position: { type: "Point" as const, coordinates: [17.22, 48.18, 133] as [number, number, number] },
        tolerance: null,
      },
    ],
  };

  const mockInspection = {
    id: "insp-1",
    mission_id: "m-1",
    template_id: "tpl-1",
    config_id: null,
    method: "VERTICAL_PROFILE" as const,
    sequence_order: 1,
    lha_ids: null,
    config: null,
  };

  const mockTemplate = {
    id: "tpl-1",
    name: "Test Template",
    description: null,
    angular_tolerances: null,
    created_by: null,
    created_at: null,
    updated_at: null,
    default_config: null,
    target_agl_ids: ["agl-1"],
    methods: ["VERTICAL_PROFILE" as const],
    mission_count: 0,
  };

  it("toggles LHA checkbox and calls onToggleLha with correct id", () => {
    const onToggleLha = vi.fn();
    const onChange = vi.fn();

    render(
      <InspectionConfigForm
        inspection={mockInspection}
        template={mockTemplate}
        agls={[mockAgl]}
        droneProfile={null}
        configOverride={{}}
        onChange={onChange}
        selectedLhaIds={new Set<string>()}
        onToggleLha={onToggleLha}
      />,
    );

    const checkbox = screen.getByTestId("lha-checkbox-lha-1");
    fireEvent.click(checkbox);

    expect(onToggleLha).toHaveBeenCalledWith("lha-1");
  });

  it("shows LHA as checked when in selectedLhaIds", () => {
    const onToggleLha = vi.fn();
    const onChange = vi.fn();

    render(
      <InspectionConfigForm
        inspection={mockInspection}
        template={mockTemplate}
        agls={[mockAgl]}
        droneProfile={null}
        configOverride={{}}
        onChange={onChange}
        selectedLhaIds={new Set(["lha-1"])}
        onToggleLha={onToggleLha}
      />,
    );

    const checkbox = screen.getByTestId("lha-checkbox-lha-1") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    const checkbox2 = screen.getByTestId("lha-checkbox-lha-2") as HTMLInputElement;
    expect(checkbox2.checked).toBe(false);
  });
});

describe("WaypointInfoPanel", () => {
  it("shows placeholder when no waypoint selected", () => {
    render(<WaypointInfoPanel waypoint={null} />);
    expect(
      screen.getByText("mission.config.selectWaypoint"),
    ).toBeInTheDocument();
  });

  it("shows waypoint details when a waypoint is selected", () => {
    render(
      <WaypointInfoPanel
        waypoint={{
          id: "wp-1",
          flight_plan_id: "fp-1",
          inspection_id: null,
          sequence_order: 1,
          position: { type: "Point", coordinates: [17.21, 48.17, 140] },
          heading: 90,
          speed: 5,
          hover_duration: null,
          camera_action: "PHOTO_CAPTURE",
          waypoint_type: "MEASUREMENT",
          camera_target: null,
          gimbal_pitch: -45,
        }}
      />,
    );

    expect(screen.getByText("MEASUREMENT")).toBeInTheDocument();
    expect(screen.getByText("90.0°")).toBeInTheDocument();
    expect(screen.getByText("5 m/s")).toBeInTheDocument();
    expect(screen.getByText("mission.config.captureMode.photoCapture")).toBeInTheDocument();
    expect(screen.getByText("-45.0°")).toBeInTheDocument();
  });
});
