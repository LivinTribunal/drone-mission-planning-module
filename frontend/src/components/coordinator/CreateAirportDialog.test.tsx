import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CreateAirportDialog from "./CreateAirportDialog";
import type { AirportLookupResponse, AirportResponse } from "@/types/airport";

// mock the airport api so the dialog never hits the network
vi.mock("@/api/airports", () => ({
  lookupAirport: vi.fn(),
  createAirport: vi.fn(),
  createSurface: vi.fn(),
  createObstacle: vi.fn(),
  createSafetyZone: vi.fn(),
}));

// isAxiosError needs a stable boolean check; use the real one via lightweight stub
vi.mock("@/api/client", () => ({
  default: {},
  isAxiosError: (err: unknown): err is { response?: { status?: number } } =>
    typeof err === "object" && err !== null && "isAxiosError" in err,
}));

// the map picker is rendered conditionally and pulls in maplibre, stub it
vi.mock("./MapCoordinatePicker", () => ({
  default: () => <div data-testid="map-coordinate-picker" />,
}));

import {
  createAirport,
  createObstacle,
  createSafetyZone,
  createSurface,
  lookupAirport,
} from "@/api/airports";

const mockLookup = lookupAirport as unknown as ReturnType<typeof vi.fn>;
const mockCreateAirport = createAirport as unknown as ReturnType<typeof vi.fn>;
const mockCreateSurface = createSurface as unknown as ReturnType<typeof vi.fn>;
const mockCreateObstacle = createObstacle as unknown as ReturnType<typeof vi.fn>;
const mockCreateSafetyZone = createSafetyZone as unknown as ReturnType<typeof vi.fn>;

function makeAxiosError(status: number) {
  /** build a stub that satisfies our mocked isAxiosError check. */
  return { isAxiosError: true, response: { status } };
}

function makeLookupResponse(
  overrides: Partial<AirportLookupResponse> = {},
): AirportLookupResponse {
  /** build a fully-populated lookup response with sane defaults. */
  return {
    icao_code: "LZIB",
    name: "Bratislava Airport",
    city: "Bratislava",
    country: "Slovakia",
    elevation: 133,
    location: { type: "Point", coordinates: [17.21, 48.17, 133] },
    runways: [
      {
        identifier: "04",
        heading: 40,
        length: 2900,
        width: 45,
        threshold_position: { type: "Point", coordinates: [17.21, 48.17, 133] },
        end_position: { type: "Point", coordinates: [17.23, 48.19, 133] },
        geometry: {
          type: "LineString",
          coordinates: [
            [17.21, 48.17, 133],
            [17.23, 48.19, 133],
          ],
        },
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [17.21, 48.17, 133],
              [17.23, 48.19, 133],
              [17.23, 48.18, 133],
              [17.21, 48.16, 133],
              [17.21, 48.17, 133],
            ],
          ],
        },
      },
      {
        identifier: "22",
        heading: 220,
        length: 2900,
        width: 45,
        threshold_position: { type: "Point", coordinates: [17.23, 48.19, 133] },
        end_position: { type: "Point", coordinates: [17.21, 48.17, 133] },
        geometry: {
          type: "LineString",
          coordinates: [
            [17.23, 48.19, 133],
            [17.21, 48.17, 133],
          ],
        },
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [17.23, 48.19, 133],
              [17.21, 48.17, 133],
              [17.21, 48.16, 133],
              [17.23, 48.18, 133],
              [17.23, 48.19, 133],
            ],
          ],
        },
      },
    ],
    obstacles: [
      {
        name: "TV Mast",
        type: "TOWER",
        height: 120,
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [17.22, 48.18, 133],
              [17.221, 48.18, 133],
              [17.221, 48.181, 133],
              [17.22, 48.181, 133],
              [17.22, 48.18, 133],
            ],
          ],
        },
      },
    ],
    safety_zones: [
      {
        name: "LZIB CTR",
        type: "CTR",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [17.2, 48.1, 0],
              [17.3, 48.1, 0],
              [17.3, 48.2, 0],
              [17.2, 48.2, 0],
              [17.2, 48.1, 0],
            ],
          ],
        },
        altitude_floor: 0,
        altitude_ceiling: 1524,
      },
    ],
    ...overrides,
  };
}

const baseAirportResponse: AirportResponse = {
  id: "new-airport-id",
  icao_code: "LZIB",
  name: "Bratislava Airport",
  city: "Bratislava",
  country: "Slovakia",
  elevation: 133,
  location: { type: "Point", coordinates: [17.21, 48.17, 133] },
  default_drone_profile_id: null,
  terrain_source: "FLAT",
  has_dem: false,
};

function renderDialog(props: Partial<React.ComponentProps<typeof CreateAirportDialog>> = {}) {
  /** render the dialog with sensible defaults and return the spies. */
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = render(
    <CreateAirportDialog
      isOpen={true}
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );
  return { ...utils, onClose, onCreated };
}

function fillIcao(value: string) {
  /** type an icao code into the input. */
  const input = screen.getByLabelText("coordinator.createAirport.icaoCode");
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateAirportDialog - lookup", () => {
  it("fills form fields and shows suggestion panel on successful lookup", async () => {
    mockLookup.mockResolvedValueOnce(makeLookupResponse());

    renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-suggestions")).toBeInTheDocument();
    });

    expect(mockLookup).toHaveBeenCalledWith("LZIB", 3);
    expect(screen.getByLabelText("coordinator.createAirport.name")).toHaveValue(
      "Bratislava Airport",
    );
    expect(screen.getByLabelText("coordinator.createAirport.latitude")).toHaveValue(48.17);
    expect(screen.getByLabelText("coordinator.createAirport.longitude")).toHaveValue(17.21);
    expect(screen.getByTestId("runway-suggestion-0")).toBeChecked();
    expect(screen.getByTestId("runway-suggestion-1")).toBeChecked();
    expect(screen.getByTestId("safety-zone-suggestion-0")).toBeChecked();
    expect(screen.getByTestId("obstacle-suggestion-0")).toBeChecked();
  });

  it("renders 'not found' message when the api responds with 404", async () => {
    mockLookup.mockRejectedValueOnce(makeAxiosError(404));

    renderDialog();
    fillIcao("XXXX");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-error")).toHaveTextContent(
        "coordinator.createAirport.lookup.notFound",
      );
    });
    expect(screen.queryByTestId("lookup-suggestions")).not.toBeInTheDocument();
  });

  it("renders 'no api key' message when the api responds with 503", async () => {
    mockLookup.mockRejectedValueOnce(makeAxiosError(503));

    renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-error")).toHaveTextContent(
        "coordinator.createAirport.lookup.noApiKey",
      );
    });
  });

  it("renders generic api error for non-404/503 failures", async () => {
    mockLookup.mockRejectedValueOnce(new Error("boom"));

    renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-error")).toHaveTextContent(
        "coordinator.createAirport.lookup.apiDown",
      );
    });
  });

  it("shows the 'no suggestions' hint when lookup returns an empty payload", async () => {
    mockLookup.mockResolvedValueOnce(
      makeLookupResponse({ runways: [], obstacles: [], safety_zones: [] }),
    );

    renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-empty")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("lookup-suggestions")).not.toBeInTheDocument();
  });

  it("blocks lookup when the icao input is invalid", async () => {
    renderDialog();
    fillIcao("X");
    // button is disabled while icao length < 4
    expect(screen.getByTestId("lookup-airport-button")).toBeDisabled();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe("CreateAirportDialog - suggestion toggles", () => {
  async function renderWithSuggestions() {
    /** render and seed the dialog with default suggestions. */
    mockLookup.mockResolvedValueOnce(makeLookupResponse());
    const utils = renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));
    await waitFor(() => {
      expect(screen.getByTestId("lookup-suggestions")).toBeInTheDocument();
    });
    return utils;
  }

  it("toggles a single runway checkbox without affecting the others", async () => {
    await renderWithSuggestions();

    fireEvent.click(screen.getByTestId("runway-suggestion-0"));

    expect(screen.getByTestId("runway-suggestion-0")).not.toBeChecked();
    expect(screen.getByTestId("runway-suggestion-1")).toBeChecked();
    expect(screen.getByTestId("safety-zone-suggestion-0")).toBeChecked();
  });

  it("flips every item in a section when the section 'none' control is clicked", async () => {
    await renderWithSuggestions();

    // both runways start checked - the runway section's 'none' button unchecks both
    const noneButtons = screen.getAllByText("coordinator.createAirport.lookup.none");
    fireEvent.click(noneButtons[0]);

    expect(screen.getByTestId("runway-suggestion-0")).not.toBeChecked();
    expect(screen.getByTestId("runway-suggestion-1")).not.toBeChecked();
    // sibling sections untouched
    expect(screen.getByTestId("safety-zone-suggestion-0")).toBeChecked();
    expect(screen.getByTestId("obstacle-suggestion-0")).toBeChecked();
  });

  it("flips every suggestion when the top-level deselect-all is clicked", async () => {
    await renderWithSuggestions();

    fireEvent.click(screen.getByText("coordinator.createAirport.lookup.deselectAll"));

    expect(screen.getByTestId("runway-suggestion-0")).not.toBeChecked();
    expect(screen.getByTestId("runway-suggestion-1")).not.toBeChecked();
    expect(screen.getByTestId("safety-zone-suggestion-0")).not.toBeChecked();
    expect(screen.getByTestId("obstacle-suggestion-0")).not.toBeChecked();

    // and toggling back
    fireEvent.click(screen.getByText("coordinator.createAirport.lookup.selectAll"));
    expect(screen.getByTestId("runway-suggestion-0")).toBeChecked();
    expect(screen.getByTestId("safety-zone-suggestion-0")).toBeChecked();
  });
});

describe("CreateAirportDialog - submission", () => {
  async function renderAndLookup() {
    /** render with a populated form ready for submission. */
    mockLookup.mockResolvedValueOnce(makeLookupResponse());
    const utils = renderDialog();
    fillIcao("LZIB");
    fireEvent.click(screen.getByTestId("lookup-airport-button"));
    await waitFor(() => {
      expect(screen.getByTestId("lookup-suggestions")).toBeInTheDocument();
    });
    return utils;
  }

  it("creates airport + every checked suggestion and closes on full success", async () => {
    const { onCreated } = await renderAndLookup();

    mockCreateAirport.mockResolvedValueOnce(baseAirportResponse);
    mockCreateSurface.mockResolvedValue({});
    mockCreateObstacle.mockResolvedValue({});
    mockCreateSafetyZone.mockResolvedValue({});

    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("new-airport-id");
    });

    expect(mockCreateAirport).toHaveBeenCalledTimes(1);
    // 2 runways + 1 obstacle + 1 safety zone all checked by default
    expect(mockCreateSurface).toHaveBeenCalledTimes(2);
    expect(mockCreateObstacle).toHaveBeenCalledTimes(1);
    expect(mockCreateSafetyZone).toHaveBeenCalledTimes(1);
  });

  it("skips unchecked suggestions when posting children", async () => {
    await renderAndLookup();

    // uncheck both runways via the runway section's 'none' control
    const noneButtons = screen.getAllByText("coordinator.createAirport.lookup.none");
    fireEvent.click(noneButtons[0]);

    mockCreateAirport.mockResolvedValueOnce(baseAirportResponse);
    mockCreateSurface.mockResolvedValue({});
    mockCreateObstacle.mockResolvedValue({});
    mockCreateSafetyZone.mockResolvedValue({});

    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    await waitFor(() => {
      expect(mockCreateAirport).toHaveBeenCalled();
    });

    // runway section was deselected, so createSurface should not be called
    expect(mockCreateSurface).not.toHaveBeenCalled();
    expect(mockCreateObstacle).toHaveBeenCalledTimes(1);
    expect(mockCreateSafetyZone).toHaveBeenCalledTimes(1);
  });

  it("keeps modal open and shows partial-failure banner when a suggestion fails", async () => {
    const { onCreated } = await renderAndLookup();

    mockCreateAirport.mockResolvedValueOnce(baseAirportResponse);
    mockCreateSurface.mockResolvedValue({});
    mockCreateObstacle.mockRejectedValueOnce(new Error("nope"));
    mockCreateSafetyZone.mockResolvedValue({});

    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    // partial-failure banner uses an interpolated key; mocked t() returns the key as-is
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.createAirport.lookup.partialFailure"),
      ).toBeInTheDocument();
    });

    // the dialog must NOT call onCreated automatically when there are failures
    expect(onCreated).not.toHaveBeenCalled();

    // 'continue' escape hatch is rendered, replacing the cancel/submit buttons
    expect(screen.getByTestId("continue-after-partial-failure")).toBeInTheDocument();
  });

  it("'continue' button calls onCreated with the already-created airport id", async () => {
    const { onCreated } = await renderAndLookup();

    mockCreateAirport.mockResolvedValueOnce(baseAirportResponse);
    mockCreateSurface.mockResolvedValue({});
    mockCreateObstacle.mockRejectedValueOnce(new Error("nope"));
    mockCreateSafetyZone.mockResolvedValue({});

    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("continue-after-partial-failure")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("continue-after-partial-failure"));
    expect(onCreated).toHaveBeenCalledWith("new-airport-id");
  });

  it("surfaces icao conflict (409) as an inline icao error", async () => {
    renderDialog();
    fillIcao("LZIB");
    // populate required fields so validate() passes
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.name"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.latitude"), {
      target: { value: "48" },
    });
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.longitude"), {
      target: { value: "17" },
    });
    fireEvent.change(screen.getByLabelText("coordinator.createAirport.altitude"), {
      target: { value: "133" },
    });

    mockCreateAirport.mockRejectedValueOnce(makeAxiosError(409));

    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("icao-error")).toHaveTextContent(
        "coordinator.createAirport.icaoConflict",
      );
    });
  });

  it("blocks submission when required fields are empty", async () => {
    const { onCreated } = renderDialog();
    // submit with completely empty form
    await act(async () => {
      fireEvent.submit(screen.getByTestId("create-airport-form"));
    });

    expect(mockCreateAirport).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId("icao-error")).toBeInTheDocument();
  });
});
