import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapCoordinatePicker from "./MapCoordinatePicker";

// global maplibre mock in setupTests doesn't include Marker; click handler never fires in tests

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof MapCoordinatePicker>> = {},
) {
  /** render the picker with sensible valid defaults. */
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <MapCoordinatePicker
      onConfirm={onConfirm}
      onClose={onClose}
      initialLat={48.17}
      initialLon={17.21}
      {...overrides}
    />,
  );
  return { ...utils, onConfirm, onClose };
}

describe("MapCoordinatePicker - validation", () => {
  it("renders no range errors for valid default coords", () => {
    renderPicker();
    expect(screen.queryByTestId("picker-lat-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("picker-lon-error")).not.toBeInTheDocument();
  });

  it("confirm button is enabled for valid coordinates", () => {
    renderPicker();
    const confirmButton = screen.getByRole("button", {
      name: "coordinator.coordinatePicker.confirm",
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it("shows lat range error and disables confirm when latitude is out of range", () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.latitude"), {
      target: { value: "91" },
    });
    expect(screen.getByTestId("picker-lat-error")).toHaveTextContent(
      "coordinator.coordinatePicker.latRange",
    );
    expect(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    ).toBeDisabled();
  });

  it("shows lon range error and disables confirm when longitude is out of range", () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.longitude"), {
      target: { value: "-200" },
    });
    expect(screen.getByTestId("picker-lon-error")).toHaveTextContent(
      "coordinator.coordinatePicker.lonRange",
    );
    expect(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    ).toBeDisabled();
  });

  it("disables confirm when latitude field is cleared (NaN)", () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.latitude"), {
      target: { value: "" },
    });
    expect(screen.getByTestId("picker-lat-error")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    ).toBeDisabled();
  });

  it("does not silently coerce cleared input to 0", () => {
    const { onConfirm } = renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.latitude"), {
      target: { value: "" },
    });
    // confirm is disabled, but clicking it (bypass) should not call with lat=0
    fireEvent.click(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with current lat/lon/alt when valid and confirm clicked", () => {
    const { onConfirm } = renderPicker();
    fireEvent.click(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    );
    expect(onConfirm).toHaveBeenCalledWith({ lat: 48.17, lon: 17.21, alt: 0 });
  });

  it("allows edge-valid coordinates (lat=90, lon=-180)", () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.latitude"), {
      target: { value: "90" },
    });
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.longitude"), {
      target: { value: "-180" },
    });
    expect(screen.queryByTestId("picker-lat-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("picker-lon-error")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    ).not.toBeDisabled();
  });
});
