/** tests for AirportSelector - verifies no redundant fetches on selection. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AirportSelector from "./AirportSelector";

const mockListAirports = vi.fn();

vi.mock("@/api/client", () => ({
  default: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
  setOnUnauthorized: vi.fn(),
  setGetAccessToken: vi.fn(),
  setSetNewAccessToken: vi.fn(),
}));

vi.mock("@/api/airports", () => ({
  listAirports: (...args: unknown[]) => mockListAirports(...args),
  getAirport: vi.fn().mockResolvedValue({
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    surfaces: [],
    obstacles: [],
    safety_zones: [],
  }),
}));

const AIRPORTS = [
  {
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    city: null,
    country: null,
    elevation: 133,
    location: { type: "Point" as const, coordinates: [17.21, 48.17, 133] as [number, number, number] },
    default_drone_profile_id: null,
    terrain_source: "FLAT" as const,
    has_dem: false,
  },
  {
    id: "apt-2",
    icao_code: "LZKZ",
    name: "Kosice",
    city: null,
    country: null,
    elevation: 234,
    location: { type: "Point" as const, coordinates: [21.24, 48.67, 234] as [number, number, number] },
    default_drone_profile_id: null,
    terrain_source: "FLAT" as const,
    has_dem: false,
  },
];

function Wrapper({ children }: { children: ReactNode }) {
  /** test wrapper with all required providers. */
  return (
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>{children}</AirportProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe("AirportSelector", () => {
  /** tests for fetch behavior and selection. */

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockListAirports.mockResolvedValue({ data: AIRPORTS, meta: { total: 2 } });
  });

  it("fetches airports once on mount and does not re-fetch on selection", async () => {
    render(<AirportSelector />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockListAirports).toHaveBeenCalledTimes(1);
    });

    // open dropdown and select an airport
    fireEvent.click(screen.getByTestId("airport-selector"));

    await waitFor(() => {
      expect(screen.getByText("Bratislava")).toBeInTheDocument();
    });

    // click the airport entry inside the dropdown list
    const options = screen.getAllByText("Bratislava");
    const dropdownOption = options.find(
      (el) => el.closest("button") && el.closest("button") !== screen.getByTestId("airport-selector"),
    );
    if (dropdownOption) {
      fireEvent.click(dropdownOption.closest("button")!);
    }

    // wait a tick - listAirports should still only have been called once
    await waitFor(() => {
      expect(mockListAirports).toHaveBeenCalledTimes(1);
    });
  });

  it("renders airport list in dropdown", async () => {
    render(<AirportSelector />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockListAirports).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("airport-selector"));

    await waitFor(() => {
      expect(screen.getByText("LZIB")).toBeInTheDocument();
      expect(screen.getByText("LZKZ")).toBeInTheDocument();
    });
  });
});
