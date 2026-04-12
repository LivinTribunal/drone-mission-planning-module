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

      await waitFor(() => {
        expect(screen.getByText("coordinator.creation.createError")).toBeInTheDocument();
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

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<CreationForm {...defaultProps} onCancel={onCancel} />);
    // the X button in the header
    const closeButtons = screen.getByTestId("creation-form").querySelectorAll("button");
    fireEvent.click(closeButtons[0]);
    expect(onCancel).toHaveBeenCalled();
  });
});
