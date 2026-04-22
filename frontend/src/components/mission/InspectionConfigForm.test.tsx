import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectionConfigForm from "./InspectionConfigForm";
import type { InspectionResponse, MissionDetailResponse } from "@/types/mission";

// minimal template/inspection stubs
const baseInspection = (
  overrides: Partial<InspectionResponse> = {},
): InspectionResponse => ({
  id: "i-1",
  mission_id: "m-1",
  template_id: "t-1",
  config_id: null,
  method: "FLY_OVER",
  sequence_order: 1,
  lha_ids: null,
  config: null,
  ...overrides,
});

const runwayTemplate = {
  id: "t-1",
  name: "Runway Inspection",
  description: null,
  methods: ["FLY_OVER", "PARALLEL_SIDE_SWEEP", "HOVER_POINT_LOCK"],
  target_agl_ids: ["agl-runway"],
  angular_tolerances: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  default_config: null,
  mission_count: 0,
};

const papiTemplate = {
  ...runwayTemplate,
  id: "t-2",
  methods: ["VERTICAL_PROFILE", "HORIZONTAL_RANGE", "HOVER_POINT_LOCK"],
  target_agl_ids: ["agl-papi"],
};

const runwayAgl = {
  id: "agl-runway",
  surface_id: "s-1",
  agl_type: "RUNWAY_EDGE_LIGHTS",
  name: "Runway Edge Lights",
  position: { lat: 0, lng: 0, alt: 0 },
  side: null,
  glide_slope_angle: null,
  distance_from_threshold: null,
  offset_from_centerline: null,
  lhas: [
    {
      id: "lha-1",
      agl_id: "agl-runway",
      unit_designator: "A",
      setting_angle: null,
      transition_sector_width: null,
      lamp_type: "LED",
      position: { lat: 0, lng: 0, alt: 0 },
      tolerance: null,
    },
  ],
};

const baseMission: MissionDetailResponse = {
  id: "m-1",
  name: "Test Mission",
  status: "DRAFT",
  airport_id: "a-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
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
  require_perpendicular_runway_crossing: true,
  flight_plan_scope: "FULL",
  has_unsaved_map_changes: false,
  computation_status: "IDLE",
  computation_error: null,
  computation_started_at: null,
  inspection_count: 0,
  estimated_duration: null,
  inspections: [],
};

function renderForm(
  overrides: Partial<Parameters<typeof InspectionConfigForm>[0]> = {},
) {
  const props = {
    inspection: baseInspection(),
    template: runwayTemplate as never,
    agls: [runwayAgl] as never,
    droneProfile: null,
    mission: baseMission,
    configOverride: {},
    onChange: vi.fn(),
    selectedLhaIds: new Set<string>(),
    onToggleLha: vi.fn(),
    disabled: false,
    ...overrides,
  };
  return { ...render(<InspectionConfigForm {...props} />), props };
}

describe("InspectionConfigForm method variants", () => {
  it("shows fly-over fields only when method is FLY_OVER", () => {
    renderForm({ inspection: baseInspection({ method: "FLY_OVER" }) });
    expect(screen.getByTestId("fly-over-fields")).toBeInTheDocument();
    expect(
      screen.queryByTestId("parallel-side-sweep-fields"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("hover-point-lock-fields"),
    ).not.toBeInTheDocument();
  });

  it("shows parallel-side-sweep fields only when method is PARALLEL_SIDE_SWEEP", () => {
    renderForm({
      inspection: baseInspection({ method: "PARALLEL_SIDE_SWEEP" }),
    });
    expect(
      screen.getByTestId("parallel-side-sweep-fields"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("fly-over-fields")).not.toBeInTheDocument();
  });

  it("shows hover-point-lock fields only when method is HOVER_POINT_LOCK", () => {
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
    });
    expect(
      screen.getByTestId("hover-point-lock-fields"),
    ).toBeInTheDocument();
  });

  it("does not render method-specific sections for HORIZONTAL_RANGE", () => {
    renderForm({
      inspection: baseInspection({ method: "HORIZONTAL_RANGE" }),
      template: papiTemplate as never,
    });
    expect(screen.queryByTestId("fly-over-fields")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("parallel-side-sweep-fields"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("hover-point-lock-fields"),
    ).not.toBeInTheDocument();
  });

  it("propagates height_above_lights changes for fly-over", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      onChange,
    });
    fireEvent.change(screen.getByTestId("inspection-height-above-lights"), {
      target: { value: "12" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ height_above_lights: 12 }),
    );
  });

  it("hover-point-lock: toggling angle lock flips state", () => {
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
    });
    const btn = screen.getByTestId("angle-lock-toggle");
    expect(btn).toHaveAttribute("aria-checked", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-checked", "true");
  });

  it("hover-point-lock: editing height with lock on recomputes gimbal angle", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
      configOverride: { distance_from_lha: 10, camera_gimbal_angle: -45 },
      onChange,
    });
    fireEvent.click(screen.getByTestId("angle-lock-toggle"));
    fireEvent.change(screen.getByTestId("inspection-height-above-lha"), {
      target: { value: "10" },
    });
    // last call should have both height_above_lha=10 and camera_gimbal_angle = -45
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last).toMatchObject({ height_above_lha: 10 });
    expect(last.camera_gimbal_angle).toBeCloseTo(-45, 1);
  });

  it("hides geometry-override fields for methods that ignore them", () => {
    for (const method of [
      "FLY_OVER",
      "PARALLEL_SIDE_SWEEP",
      "HOVER_POINT_LOCK",
    ] as const) {
      const { unmount } = renderForm({
        inspection: baseInspection({ method }),
        template: (method === "HOVER_POINT_LOCK" ? papiTemplate : runwayTemplate) as never,
      });
      expect(
        screen.queryByTestId("inspection-horizontal-distance"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("inspection-sweep-angle"),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders geometry-override fields for VERTICAL_PROFILE and HORIZONTAL_RANGE", () => {
    // horizontal range shows horizontal_distance + sweep_angle;
    // vertical profile shows horizontal_distance + vertical_profile_height.
    const cases: Array<{ method: "VERTICAL_PROFILE" | "HORIZONTAL_RANGE"; secondField: string }> = [
      { method: "HORIZONTAL_RANGE", secondField: "inspection-sweep-angle" },
      { method: "VERTICAL_PROFILE", secondField: "inspection-vertical-profile-height" },
    ];
    for (const { method, secondField } of cases) {
      const { unmount } = renderForm({
        inspection: baseInspection({ method }),
        template: papiTemplate as never,
      });
      expect(
        screen.getByTestId("inspection-horizontal-distance"),
      ).toBeInTheDocument();
      expect(screen.getByTestId(secondField)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders measurement speed field for all methods except hover-point-lock", () => {
    for (const method of [
      "VERTICAL_PROFILE",
      "FLY_OVER",
      "PARALLEL_SIDE_SWEEP",
      "HORIZONTAL_RANGE",
    ] as const) {
      const { unmount } = renderForm({
        inspection: baseInspection({ method }),
        template: (method === "VERTICAL_PROFILE" ? papiTemplate : runwayTemplate) as never,
      });
      expect(
        screen.getByTestId("inspection-measurement-speed-override"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("hides measurement speed field for hover-point-lock", () => {
    const { unmount } = renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
    });
    expect(
      screen.queryByTestId("inspection-measurement-speed-override"),
    ).not.toBeInTheDocument();
    unmount();
  });

  it("propagates measurement_speed_override changes", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      onChange,
    });
    fireEvent.change(
      screen.getByTestId("inspection-measurement-speed-override"),
      { target: { value: "2.5" } },
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_speed_override: 2.5 }),
    );
  });

  it("auto-fills optical_zoom clamped to max_optical_zoom", async () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
      configOverride: { distance_from_lha: 500, height_above_lha: 100 },
      droneProfile: {
        id: "d-1",
        name: "Test Drone",
        sensor_fov: 84,
        max_optical_zoom: 7,
      } as never,
      onChange,
    });
    const call = onChange.mock.calls.find(
      (c) => typeof c[0]?.optical_zoom === "number",
    );
    expect(call).toBeTruthy();
    expect(call![0].optical_zoom).toBeLessThanOrEqual(7);
  });

  it("propagates focus_mode dropdown changes", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
      configOverride: { camera_mode: "MANUAL" },
      onChange,
    });
    fireEvent.change(screen.getByTestId("inspection-focus-mode"), {
      target: { value: "INFINITY" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ focus_mode: "INFINITY" }),
    );
  });

  it("renders zoom-over-optical warning when optical_zoom exceeds max_optical_zoom", () => {
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
      configOverride: { optical_zoom: 10, camera_mode: "MANUAL" },
      droneProfile: {
        id: "d-1",
        name: "Test Drone",
        sensor_fov: 84,
        max_optical_zoom: 7,
      } as never,
    });
    expect(
      screen.getByTestId("zoom-over-optical-warning"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("zoom-over-optical-validation"),
    ).toBeInTheDocument();
  });

  it("hover-point-lock: editing distance without lock does not recompute", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "HOVER_POINT_LOCK" }),
      template: papiTemplate as never,
      configOverride: { distance_from_lha: 10, camera_gimbal_angle: -45 },
      onChange,
    });
    fireEvent.change(screen.getByTestId("inspection-distance-from-lha"), {
      target: { value: "20" },
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last).toMatchObject({ distance_from_lha: 20 });
    expect(last.height_above_lha).toBeUndefined();
  });

  it("direction widget renders for the three in-scope methods", () => {
    const methods = ["HORIZONTAL_RANGE", "FLY_OVER", "PARALLEL_SIDE_SWEEP"] as const;
    for (const method of methods) {
      const { unmount } = renderForm({
        inspection: baseInspection({ method }),
        template: papiTemplate as never,
      });
      expect(screen.getByTestId("direction-reversed-section")).toBeInTheDocument();
      unmount();
    }
  });

  it("direction widget is hidden for the three excluded methods", () => {
    const excluded = ["HOVER_POINT_LOCK", "MEHT_CHECK", "VERTICAL_PROFILE"] as const;
    for (const method of excluded) {
      const { unmount } = renderForm({
        inspection: baseInspection({ method }),
        template: papiTemplate as never,
      });
      expect(screen.queryByTestId("direction-reversed-section")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("direction widget shows placeholder when bearing is null", () => {
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      directionBearing: null,
    });
    // the i18n stub echoes the key; real app renders "—"
    expect(screen.getByTestId("inspection-direction-bearing").textContent).toBe(
      "mission.config.direction.unknown",
    );
  });

  it("direction widget shows the bearing when provided", () => {
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      directionBearing: 142,
    });
    expect(screen.getByTestId("inspection-direction-bearing").textContent).toBe("142°");
  });

  it("direction mode REVERSED sets direction_reversed=true and direction_is_auto=false", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      onChange,
    });
    fireEvent.click(screen.getByTestId("inspection-direction-mode-reversed"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ direction_reversed: true, direction_is_auto: false }),
    );
  });

  it("direction mode NATURAL resets direction_reversed=false and direction_is_auto=false", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      configOverride: { direction_reversed: true },
      onChange,
    });
    fireEvent.click(screen.getByTestId("inspection-direction-mode-natural"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ direction_reversed: false, direction_is_auto: false }),
    );
  });

  it("direction mode AUTO sets direction_is_auto=true", () => {
    const onChange = vi.fn();
    renderForm({
      inspection: baseInspection({ method: "FLY_OVER" }),
      onChange,
    });
    fireEvent.click(screen.getByTestId("inspection-direction-mode-auto"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ direction_is_auto: true }),
    );
  });
});
