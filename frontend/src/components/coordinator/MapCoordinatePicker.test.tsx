import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// capture the handler registered via map.on("click", ...) so tests can simulate clicks
type MapEventHandler = (e: { lngLat: { lat: number; lng: number } }) => void | Promise<void>;
const mapClickHandler: { current: MapEventHandler | null } = { current: null };

vi.mock("maplibre-gl", () => {
  const MockMap = vi.fn().mockImplementation(function () {
    return {
      on: vi.fn((event: string, handler: MapEventHandler) => {
        if (event === "click") mapClickHandler.current = handler;
      }),
      off: vi.fn(),
      once: vi.fn(),
      remove: vi.fn(),
      addControl: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      resize: vi.fn(),
      getLayer: vi.fn().mockReturnValue(null),
      setLayoutProperty: vi.fn(),
      setStyle: vi.fn(),
      getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
      getZoom: vi.fn().mockReturnValue(4),
      setCenter: vi.fn(),
      setZoom: vi.fn(),
      isStyleLoaded: vi.fn().mockReturnValue(false),
      queryRenderedFeatures: vi.fn().mockReturnValue([]),
    };
  });
  const MockMarker = vi.fn().mockImplementation(function () {
    return {
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    };
  });
  const MockNavigationControl = vi.fn();
  return {
    default: { Map: MockMap, Marker: MockMarker, NavigationControl: MockNavigationControl },
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: MockNavigationControl,
  };
});

import MapCoordinatePicker from "./MapCoordinatePicker";

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

  it("coerces cleared altitude to 0 without changing lat/lon", () => {
    const { onConfirm } = renderPicker();
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.altitude"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "coordinator.coordinatePicker.confirm" }),
    );
    expect(onConfirm).toHaveBeenCalledWith({ lat: 48.17, lon: 17.21, alt: 0 });
  });
});

describe("MapCoordinatePicker - enlarge toggle", () => {
  it("toggles the enlarge button label between enlarge and collapse", () => {
    renderPicker();
    const button = screen.getByTestId("coordinate-picker-enlarge");
    expect(button).toHaveAttribute(
      "aria-label",
      "coordinator.coordinatePicker.enlarge",
    );
    fireEvent.click(button);
    expect(button).toHaveAttribute(
      "aria-label",
      "coordinator.coordinatePicker.collapse",
    );
    fireEvent.click(button);
    expect(button).toHaveAttribute(
      "aria-label",
      "coordinator.coordinatePicker.enlarge",
    );
  });
});

describe("MapCoordinatePicker - escape key", () => {
  it("calls onClose when Escape pressed in non-enlarged state", () => {
    const { onClose } = renderPicker();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("collapses instead of closing when Escape pressed in enlarged state", () => {
    const { onClose } = renderPicker();
    const button = screen.getByTestId("coordinate-picker-enlarge");
    fireEvent.click(button);
    expect(button).toHaveAttribute(
      "aria-label",
      "coordinator.coordinatePicker.collapse",
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(button).toHaveAttribute(
      "aria-label",
      "coordinator.coordinatePicker.enlarge",
    );
  });

  it("ignores non-Escape key presses", () => {
    const { onClose } = renderPicker();
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when backdrop is clicked", () => {
    const { onClose } = renderPicker();
    const modal = screen.getByTestId("coordinate-picker-modal");
    fireEvent.click(modal);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("MapCoordinatePicker - altitude loading + user touch", () => {
  beforeEach(() => {
    mapClickHandler.current = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows spinner while elevation fetch is in flight and fills altitude on success", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(fetchPromise);

    renderPicker();
    expect(mapClickHandler.current).not.toBeNull();

    act(() => {
      // simulate a map click - fires the captured handler from the MapCoordinatePicker
      void mapClickHandler.current!({ lngLat: { lat: 50, lng: 20 } });
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText("coordinator.coordinatePicker.altitudeLoading"),
      ).toBeInTheDocument();
    });

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ results: [{ elevation: 321 }] }),
      } as Response);
      await fetchPromise;
    });

    await waitFor(() => {
      expect(
        screen.queryByLabelText("coordinator.coordinatePicker.altitudeLoading"),
      ).not.toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText("coordinator.createAirport.altitude") as HTMLInputElement)
        .value,
    ).toBe("321");
    fetchSpy.mockRestore();
  });

  it("does not overwrite altitude after user types during in-flight fetch", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(fetchPromise);

    renderPicker();
    act(() => {
      void mapClickHandler.current!({ lngLat: { lat: 50, lng: 20 } });
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText("coordinator.coordinatePicker.altitudeLoading"),
      ).toBeInTheDocument();
    });

    // user types a value while fetch is still pending - should cancel the fetch effect
    fireEvent.change(
      screen.getByLabelText("coordinator.createAirport.altitude"),
      { target: { value: "42" } },
    );
    expect(
      screen.queryByLabelText("coordinator.coordinatePicker.altitudeLoading"),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ results: [{ elevation: 999 }] }),
      } as Response);
      await fetchPromise;
    });

    expect(
      (screen.getByLabelText("coordinator.createAirport.altitude") as HTMLInputElement)
        .value,
    ).toBe("42");
    fetchSpy.mockRestore();
  });
});
