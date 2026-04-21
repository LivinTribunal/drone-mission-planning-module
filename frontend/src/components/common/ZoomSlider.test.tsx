import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ZoomSlider from "./ZoomSlider";
import { OPTICAL_ZOOM_MAX, OPTICAL_ZOOM_MIN } from "@/constants/camera";

function renderSlider(props: Partial<React.ComponentProps<typeof ZoomSlider>> = {}) {
  return render(
    <ZoomSlider
      value={props.value ?? OPTICAL_ZOOM_MIN}
      onChange={props.onChange ?? vi.fn()}
      maxOpticalZoom={props.maxOpticalZoom ?? null}
      testId={props.testId ?? "zoom"}
    />,
  );
}

describe("ZoomSlider", () => {
  it("renders a range input bound to value", () => {
    renderSlider({ value: 3 });
    const input = screen.getByTestId("zoom") as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.value).toBe("3");
    expect(input.min).toBe(String(OPTICAL_ZOOM_MIN));
    expect(input.max).toBe(String(OPTICAL_ZOOM_MAX));
  });

  it("invokes onChange with parsed float when dragged", () => {
    const onChange = vi.fn();
    renderSlider({ onChange, value: 1 });
    fireEvent.change(screen.getByTestId("zoom"), { target: { value: "4.5" } });
    expect(onChange).toHaveBeenCalledWith(4.5);
  });

  it("shows optical/digital band labels when maxOpticalZoom is provided", () => {
    renderSlider({ maxOpticalZoom: 7 });
    expect(screen.getByText("mission.config.cameraSettings.optical")).toBeInTheDocument();
    expect(screen.getByText("mission.config.cameraSettings.digital")).toBeInTheDocument();
  });

  it("omits the optical/digital band when maxOpticalZoom is null", () => {
    renderSlider({ maxOpticalZoom: null });
    expect(screen.queryByText("mission.config.cameraSettings.optical")).toBeNull();
  });

  it("renders an extra tick at maxOpticalZoom when it's not an integer on the scale", () => {
    renderSlider({ maxOpticalZoom: 5.5 });
    expect(screen.getByText("5.5x")).toBeInTheDocument();
  });
});
