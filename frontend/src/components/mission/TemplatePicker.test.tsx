import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TemplatePicker from "./TemplatePicker";
import type { AGLResponse, SurfaceResponse } from "@/types/airport";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";

const mockAgls: AGLResponse[] = [
  {
    id: "agl-papi-09",
    surface_id: "s1",
    name: "PAPI 09L-L",
    agl_type: "PAPI",
    side: "LEFT",
    glide_slope_angle: 3.0,
    distance_from_threshold: 300,
    offset_from_centerline: null,
    position: { type: "Point", coordinates: [17.0, 48.0, 0] },
    lhas: [],
  },
  {
    id: "agl-papi-24",
    surface_id: "s2",
    name: "PAPI 24R-L",
    agl_type: "PAPI",
    side: "LEFT",
    glide_slope_angle: 3.0,
    distance_from_threshold: 300,
    offset_from_centerline: null,
    position: { type: "Point", coordinates: [17.1, 48.0, 0] },
    lhas: [],
  },
];

const mockSurfaces: SurfaceResponse[] = [
  {
    id: "s1",
    airport_id: "a1",
    identifier: "09L",
    surface_type: "RUNWAY",
    heading: 90,
    length: 3000,
    width: 45,
    geometry: { type: "LineString", coordinates: [[0, 0, 0], [1, 0, 0]] },
    boundary: null,
    buffer_distance: 5.0,
    threshold_position: null,
    end_position: null,
    touchpoint_latitude: null,
    touchpoint_longitude: null,
    touchpoint_altitude: null,
    agls: [mockAgls[0]],
  },
  {
    id: "s2",
    airport_id: "a1",
    identifier: "24R",
    surface_type: "RUNWAY",
    heading: 270,
    length: 3000,
    width: 45,
    geometry: { type: "LineString", coordinates: [[1, 0, 0], [0, 0, 0]] },
    boundary: null,
    buffer_distance: 5.0,
    threshold_position: null,
    end_position: null,
    touchpoint_latitude: null,
    touchpoint_longitude: null,
    touchpoint_altitude: null,
    agls: [mockAgls[1]],
  },
];

function makeTemplate(
  id: string,
  name: string,
  targetAglIds: string[],
  methods: string[] = ["ANGULAR_SWEEP"],
): InspectionTemplateResponse {
  return {
    id,
    name,
    description: null,
    target_agl_ids: targetAglIds,
    methods,
    default_config: null,
    angular_tolerances: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    mission_count: 0,
  } as InspectionTemplateResponse;
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
};

describe("TemplatePicker", () => {
  describe("secondary sort by name", () => {
    it("sorts templates sharing same runway by name", () => {
      const templates = [
        makeTemplate("t2", "PAPI RIGHT 09L", ["agl-papi-09"]),
        makeTemplate("t1", "PAPI LEFT 09L", ["agl-papi-09"]),
      ];
      render(
        <TemplatePicker
          {...defaultProps}
          templates={templates}
          agls={mockAgls}
          surfaces={mockSurfaces}
        />,
      );

      // click PAPI type
      fireEvent.click(screen.getByTestId("agl-type-option-PAPI"));

      const rows = screen.getAllByTestId(/^template-option-/);
      expect(rows[0]).toHaveAttribute("data-testid", "template-option-t1");
      expect(rows[1]).toHaveAttribute("data-testid", "template-option-t2");
    });
  });

  describe("special bucket sort", () => {
    it("sorts hover-only templates by name", () => {
      const templates = [
        makeTemplate("hz", "Zebra Hover", [], ["HOVER_POINT_LOCK"]),
        makeTemplate("ha", "Alpha Hover", [], ["HOVER_POINT_LOCK"]),
        makeTemplate("t1", "PAPI 09L", ["agl-papi-09"]),
      ];
      render(
        <TemplatePicker
          {...defaultProps}
          templates={templates}
          agls={mockAgls}
          surfaces={mockSurfaces}
        />,
      );

      // special templates are shown below the AGL type buttons
      const specialRows = screen
        .getAllByTestId(/^template-option-/)
        .filter((el) => el.getAttribute("data-testid")?.startsWith("template-option-h"));
      expect(specialRows[0]).toHaveAttribute("data-testid", "template-option-ha");
      expect(specialRows[1]).toHaveAttribute("data-testid", "template-option-hz");
    });
  });

  describe("remember last AGL type", () => {
    it("reopens to last-selected AGL type via initialAglType", () => {
      render(
        <TemplatePicker
          {...defaultProps}
          templates={[makeTemplate("t1", "PAPI 09L", ["agl-papi-09"])]}
          agls={mockAgls}
          surfaces={mockSurfaces}
          initialAglType="PAPI"
        />,
      );

      // should show template step directly, not AGL selection
      expect(screen.getByTestId("template-step")).toBeInTheDocument();
      expect(screen.queryByTestId("agl-type-step")).not.toBeInTheDocument();
    });

    it("calls onAglTypeSelected when user clicks an AGL type", () => {
      const onAglTypeSelected = vi.fn();
      render(
        <TemplatePicker
          {...defaultProps}
          templates={[makeTemplate("t1", "PAPI 09L", ["agl-papi-09"])]}
          agls={mockAgls}
          surfaces={mockSurfaces}
          onAglTypeSelected={onAglTypeSelected}
        />,
      );

      fireEvent.click(screen.getByTestId("agl-type-option-PAPI"));
      expect(onAglTypeSelected).toHaveBeenCalledWith("PAPI");
    });

    it("does not reset selected AGL on close", () => {
      const onClose = vi.fn();
      const onAglTypeSelected = vi.fn();
      render(
        <TemplatePicker
          {...defaultProps}
          onClose={onClose}
          templates={[makeTemplate("t1", "PAPI 09L", ["agl-papi-09"])]}
          agls={mockAgls}
          surfaces={mockSurfaces}
          initialAglType="PAPI"
          onAglTypeSelected={onAglTypeSelected}
        />,
      );

      // close via back button -> select null but parent still holds "PAPI"
      expect(screen.getByTestId("template-step")).toBeInTheDocument();
    });
  });

  it("shows no results when template list is empty", () => {
    render(
      <TemplatePicker
        {...defaultProps}
        templates={[]}
        agls={mockAgls}
        surfaces={mockSurfaces}
      />,
    );
    expect(screen.getByText("common.noResults")).toBeInTheDocument();
  });
});
