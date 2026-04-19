import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreationForm from "./CreationForm";
import type { SurfaceResponse } from "@/types/airport";

const baseSurface: SurfaceResponse = {
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
  agls: [
    {
      id: "agl1",
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
  ],
};

const defaultProps = {
  geometryType: "point" as const,
  surfaces: [baseSurface],
  pointPosition: [14.26, 50.1] as [number, number],
  onCancel: vi.fn(),
  onCreate: vi.fn().mockResolvedValue(undefined),
};

describe("CreationForm", () => {
  it("renders form container", () => {
    render(<CreationForm {...defaultProps} />);
    expect(screen.getByTestId("creation-form")).toBeInTheDocument();
  });

  it("shows point categories for point geometry", () => {
    render(<CreationForm {...defaultProps} />);
    const select = screen.getByTestId("creation-category-select");
    expect(select).toBeInTheDocument();
    // point geometry shows agl and lha options
    const options = select.querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain("agl");
    expect(values).toContain("lha");
    expect(values).not.toContain("surface");
  });

  it("shows polygon categories for polygon geometry", () => {
    render(<CreationForm {...defaultProps} geometryType="polygon" />);
    const select = screen.getByTestId("creation-category-select");
    const options = select.querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain("surface");
    expect(values).toContain("safety_zone");
    expect(values).toContain("obstacle");
  });

  it("shows circle categories for circle geometry", () => {
    render(<CreationForm {...defaultProps} geometryType="circle" />);
    const select = screen.getByTestId("creation-category-select");
    const options = select.querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain("safety_zone");
    expect(values).toContain("obstacle");
    expect(values).not.toContain("surface");
  });

  describe("submit guard - canSubmit", () => {
    it("disables submit when no category selected", () => {
      render(<CreationForm {...defaultProps} />);
      // no submit button visible until entity type resolved
      expect(screen.queryByTestId("creation-submit")).not.toBeInTheDocument();
    });

    it("disables submit for agl when no surface exists", () => {
      render(<CreationForm {...defaultProps} surfaces={[]} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      // fill in the name
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "Test AGL" } });

      const submitBtn = screen.getByTestId("creation-submit");
      expect(submitBtn).toBeDisabled();
    });

    it("enables submit for agl when surface is selected", () => {
      render(<CreationForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "Test AGL" } });

      // surface auto-selected from surfaces[0]
      const submitBtn = screen.getByTestId("creation-submit");
      expect(submitBtn).not.toBeDisabled();
    });

    it("disables submit for lha when no agl selected", () => {
      render(<CreationForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "lha" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderLha");
      fireEvent.change(nameInput, { target: { value: "Test LHA" } });

      const submitBtn = screen.getByTestId("creation-submit");
      expect(submitBtn).toBeDisabled();
    });

    it("enables submit for obstacle without surface requirement", () => {
      render(
        <CreationForm
          {...defaultProps}
          geometryType="circle"
          circleRadius={50}
          circleCenter={[17.0, 48.0]}
          surfaces={[]}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "obstacle" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderObstacle");
      fireEvent.change(nameInput, { target: { value: "Tower" } });

      const submitBtn = screen.getByTestId("creation-submit");
      expect(submitBtn).not.toBeDisabled();
    });
  });

  describe("form submission", () => {
    it("calls onCreate with agl data on submit", async () => {
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(
        <CreationForm
          {...defaultProps}
          onCreate={onCreate}
          pointPosition={[17.0, 48.0]}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "PAPI 09L" } });

      fireEvent.click(screen.getByTestId("creation-submit"));

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith("agl", expect.objectContaining({
          name: "PAPI 09L",
          agl_type: "PAPI",
          side: "LEFT",
          surface_id: "s1",
          center: [17.0, 48.0],
        }));
      });
    });

    it("shows error on failed submission", async () => {
      const onCreate = vi.fn().mockRejectedValue(new Error("fail"));
      render(
        <CreationForm
          {...defaultProps}
          onCreate={onCreate}
          pointPosition={[17.0, 48.0]}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "PAPI" } });

      fireEvent.click(screen.getByTestId("creation-submit"));

      // Error instances surface their own message verbatim; the t() fallback is
      // only used for non-Error rejections.
      await waitFor(() => {
        expect(screen.getByText("fail")).toBeInTheDocument();
      });
    });

    it("does not submit when canSubmit is false (agl, no surface)", async () => {
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(<CreationForm {...defaultProps} surfaces={[]} onCreate={onCreate} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "Test" } });

      // button should be disabled, but try clicking anyway
      const submitBtn = screen.getByTestId("creation-submit");
      fireEvent.click(submitBtn);

      // onCreate should not have been called
      expect(onCreate).not.toHaveBeenCalled();
    });
  });

  describe("entity type branching", () => {
    it("shows subtype selector for polygon surface category", () => {
      render(<CreationForm {...defaultProps} geometryType="polygon" />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "surface" },
      });
      expect(screen.getByTestId("creation-type-select")).toBeInTheDocument();
    });

    it("shows subtype selector for safety_zone category", () => {
      render(<CreationForm {...defaultProps} geometryType="polygon" />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "safety_zone" },
      });
      expect(screen.getByTestId("creation-type-select")).toBeInTheDocument();
    });

    it("does not show subtype for obstacle - maps directly", () => {
      render(<CreationForm {...defaultProps} geometryType="circle" />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "obstacle" },
      });
      expect(screen.queryByTestId("creation-type-select")).not.toBeInTheDocument();
    });

    it("prefills dimensions for polygon geometry", () => {
      render(
        <CreationForm
          {...defaultProps}
          geometryType="polygon"
          prefilledWidth={45}
          prefilledLength={3000}
          prefilledHeading={90}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "surface" },
      });
      fireEvent.change(screen.getByTestId("creation-type-select"), {
        target: { value: "runway" },
      });
      // check prefilled values rendered in inputs
      const headingInput = screen.getByDisplayValue("90");
      expect(headingInput).toBeInTheDocument();
      expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
      expect(screen.getByDisplayValue("45")).toBeInTheDocument();
    });
  });

  describe("lha pre-fill from most recent lha", () => {
    const papiAgl = {
      id: "agl-papi",
      surface_id: "s1",
      name: "PAPI 09L-L",
      agl_type: "PAPI" as const,
      side: "LEFT" as const,
      glide_slope_angle: 3.0,
      distance_from_threshold: 300,
      offset_from_centerline: null,
      position: { type: "Point" as const, coordinates: [17.0, 48.0, 0] as [number, number, number] },
      lhas: [
        {
          id: "lha-1",
          agl_id: "agl-papi",
          unit_designator: "A",
          setting_angle: 2.5,
          transition_sector_width: null,
          lamp_type: "LED" as const,
          position: { type: "Point" as const, coordinates: [17.0, 48.0, 0] as [number, number, number] },
          tolerance: 0.35,
        },
        {
          id: "lha-2",
          agl_id: "agl-papi",
          unit_designator: "C",
          setting_angle: 3.5,
          transition_sector_width: null,
          lamp_type: "LED" as const,
          position: { type: "Point" as const, coordinates: [17.001, 48.0, 0] as [number, number, number] },
          tolerance: 0.45,
        },
      ],
    };

    const edgeAgl = {
      id: "agl-edge",
      surface_id: "s1",
      name: "EDGE LIGHTS RWY 09L",
      agl_type: "RUNWAY_EDGE_LIGHTS" as const,
      side: null,
      glide_slope_angle: null,
      distance_from_threshold: null,
      offset_from_centerline: null,
      position: { type: "Point" as const, coordinates: [17.0, 48.0, 0] as [number, number, number] },
      lhas: [
        {
          id: "lha-e1",
          agl_id: "agl-edge",
          unit_designator: "B",
          setting_angle: 0.0,
          transition_sector_width: null,
          lamp_type: "HALOGEN" as const,
          position: { type: "Point" as const, coordinates: [17.002, 48.0, 0] as [number, number, number] },
          tolerance: 0.2,
        },
      ],
    };

    function makeSurface(agls: SurfaceResponse["agls"]): SurfaceResponse {
      /** surface fixture wrapping given agls. */
      return { ...baseSurface, agls };
    }

    it("pre-fills PAPI LHA form: blank setting_angle, tolerance + lamp from most recent", () => {
      render(<CreationForm {...defaultProps} surfaces={[makeSurface([papiAgl])]} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "lha" },
      });
      const aglSelect = screen.getByText("coordinator.creation.selectAgl").parentElement as HTMLSelectElement;
      fireEvent.change(aglSelect, { target: { value: "agl-papi" } });

      // most recent lha has unit_designator=C, tolerance=0.45, lamp=LED
      const toleranceInput = screen.getByDisplayValue("0.45");
      expect(toleranceInput).toBeInTheDocument();

      // setting_angle must be blank for PAPI
      const angleInput = document.getElementById("create-lha-angle") as HTMLInputElement;
      expect(angleInput.value).toBe("");

      // lamp_type copied from recent (LED)
      const lampSelect = screen.getByDisplayValue("coordinator.detail.lampTypes.led");
      expect(lampSelect).toBeInTheDocument();
    });

    it("pre-fills edge-lights LHA form: setting_angle copied from most recent", () => {
      render(<CreationForm {...defaultProps} surfaces={[makeSurface([edgeAgl])]} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "lha" },
      });
      const aglSelect = screen.getByText("coordinator.creation.selectAgl").parentElement as HTMLSelectElement;
      fireEvent.change(aglSelect, { target: { value: "agl-edge" } });

      const angleInput = document.getElementById("create-lha-angle") as HTMLInputElement;
      expect(angleInput.value).toBe("0");

      const toleranceInput = screen.getByDisplayValue("0.2");
      expect(toleranceInput).toBeInTheDocument();

      // lamp carried from recent (HALOGEN) - default state is HALOGEN, but confirm it stuck
      const lampSelect = screen.getByDisplayValue("coordinator.detail.lampTypes.halogen");
      expect(lampSelect).toBeInTheDocument();
    });

    it("falls back to defaults when the AGL has no existing LHAs", () => {
      const emptyAgl = { ...papiAgl, id: "agl-empty", lhas: [] };
      render(<CreationForm {...defaultProps} surfaces={[makeSurface([emptyAgl])]} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "lha" },
      });
      const aglSelect = screen.getByText("coordinator.creation.selectAgl").parentElement as HTMLSelectElement;
      fireEvent.change(aglSelect, { target: { value: "agl-empty" } });

      const toleranceInput = screen.getByDisplayValue("0.2");
      expect(toleranceInput).toBeInTheDocument();

      const angleInput = document.getElementById("create-lha-angle") as HTMLInputElement;
      // PAPI with no existing lhas -> blank setting_angle (coordinator fills in per lha)
      expect(angleInput.value).toBe("");
    });
  });

  describe("touchpoint pick-on-map", () => {
    it("renders pick button when runway subtype + handler provided", () => {
      const onPickTouchpointToggle = vi.fn();
      render(
        <CreationForm
          {...defaultProps}
          geometryType="polygon"
          onPickTouchpointToggle={onPickTouchpointToggle}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "surface" },
      });
      fireEvent.change(screen.getByTestId("creation-type-select"), {
        target: { value: "runway" },
      });
      expect(screen.getByTestId("creation-touchpoint-pick-map")).toBeInTheDocument();
    });

    it("fires toggle handler when pick button is clicked", () => {
      const onPickTouchpointToggle = vi.fn();
      render(
        <CreationForm
          {...defaultProps}
          geometryType="polygon"
          onPickTouchpointToggle={onPickTouchpointToggle}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "surface" },
      });
      fireEvent.change(screen.getByTestId("creation-type-select"), {
        target: { value: "runway" },
      });
      fireEvent.click(screen.getByTestId("creation-touchpoint-pick-map"));
      expect(onPickTouchpointToggle).toHaveBeenCalled();
    });

    it("populates touchpoint fields and consumes when coord arrives", () => {
      const onPickedTouchpointConsumed = vi.fn();
      const { rerender } = render(
        <CreationForm
          {...defaultProps}
          geometryType="polygon"
          onPickTouchpointToggle={vi.fn()}
          onPickedTouchpointConsumed={onPickedTouchpointConsumed}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "surface" },
      });
      fireEvent.change(screen.getByTestId("creation-type-select"), {
        target: { value: "runway" },
      });
      rerender(
        <CreationForm
          {...defaultProps}
          geometryType="polygon"
          onPickTouchpointToggle={vi.fn()}
          onPickedTouchpointConsumed={onPickedTouchpointConsumed}
          pickedTouchpointCoord={{ lat: 48.123456, lon: 17.654321, alt: 200.5 }}
        />,
      );
      expect((document.getElementById("create-tp-lat") as HTMLInputElement).value).toBe("48.123456");
      expect((document.getElementById("create-tp-lon") as HTMLInputElement).value).toBe("17.654321");
      expect(onPickedTouchpointConsumed).toHaveBeenCalled();
    });
  });

  describe("no-runway AGL warning", () => {
    it("shows warning when creating AGL with no surfaces", () => {
      render(<CreationForm {...defaultProps} surfaces={[]} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      expect(screen.getByTestId("creation-no-runway-warning")).toBeInTheDocument();
    });

    it("hides warning when surfaces exist", () => {
      render(<CreationForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      expect(screen.queryByTestId("creation-no-runway-warning")).not.toBeInTheDocument();
    });
  });

  describe("PAPI-only glide slope gate", () => {
    it("shows glide slope input for PAPI type", () => {
      render(<CreationForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      expect(document.getElementById("create-glide")).toBeInTheDocument();
    });

    it("hides glide slope input for RUNWAY_EDGE_LIGHTS type", () => {
      render(<CreationForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      fireEvent.change(screen.getByTestId("creation-agl-type-select"), {
        target: { value: "RUNWAY_EDGE_LIGHTS" },
      });
      expect(document.getElementById("create-glide")).not.toBeInTheDocument();
    });

    it("omits glide_slope_angle from payload for RUNWAY_EDGE_LIGHTS", async () => {
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(
        <CreationForm
          {...defaultProps}
          onCreate={onCreate}
          pointPosition={[17.0, 48.0]}
        />,
      );
      fireEvent.change(screen.getByTestId("creation-category-select"), {
        target: { value: "agl" },
      });
      fireEvent.change(screen.getByTestId("creation-agl-type-select"), {
        target: { value: "RUNWAY_EDGE_LIGHTS" },
      });
      const nameInput = screen.getByPlaceholderText("coordinator.creation.namePlaceholderAgl");
      fireEvent.change(nameInput, { target: { value: "EDGE 09L" } });
      fireEvent.click(screen.getByTestId("creation-submit"));
      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled();
      });
      const payload = onCreate.mock.calls[0][1];
      expect(payload.glide_slope_angle).toBeUndefined();
    });
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<CreationForm {...defaultProps} onCancel={onCancel} />);
    // the X button in the header
    const closeButtons = screen.getByTestId("creation-form").querySelectorAll("button");
    fireEvent.click(closeButtons[0]);
    expect(onCancel).toHaveBeenCalled();
  });
});
