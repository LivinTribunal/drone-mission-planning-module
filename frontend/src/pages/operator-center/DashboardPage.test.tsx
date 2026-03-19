import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import DashboardPage from "./DashboardPage";

// mock api modules
vi.mock("@/api/airports", () => ({
  listAirportSummaries: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  getAirport: vi.fn().mockResolvedValue({
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    city: "Bratislava",
    country: "Slovakia",
    elevation: 133,
    location: { type: "Point", coordinates: [17.21, 48.17, 133] },
    surfaces: [],
    obstacles: [],
    safety_zones: [],
  }),
}));

vi.mock("@/api/missions", () => ({
  listMissions: vi.fn().mockResolvedValue({
    data: [
      {
        id: "m-1",
        name: "Test Mission",
        status: "DRAFT",
        airport_id: "apt-1",
        created_at: "2026-03-01T00:00:00Z",
        operator_notes: null,
        drone_profile_id: "dp-1",
        date_time: null,
        default_speed: null,
        default_altitude_offset: null,
        takeoff_coordinate: null,
        landing_coordinate: null,
      },
      {
        id: "m-2",
        name: "Alpha Mission",
        status: "PLANNED",
        airport_id: "apt-1",
        created_at: "2026-03-10T00:00:00Z",
        operator_notes: null,
        drone_profile_id: null,
        date_time: null,
        default_speed: null,
        default_altitude_offset: null,
        takeoff_coordinate: null,
        landing_coordinate: null,
      },
    ],
    meta: { total: 2 },
  }),
  createMission: vi.fn().mockResolvedValue({
    id: "m-new",
    name: "New Mission",
    status: "DRAFT",
    airport_id: "apt-1",
    created_at: "2026-03-19T00:00:00Z",
    operator_notes: null,
    drone_profile_id: "dp-1",
    date_time: null,
    default_speed: null,
    default_altitude_offset: null,
    takeoff_coordinate: null,
    landing_coordinate: null,
  }),
}));

vi.mock("@/api/droneProfiles", () => ({
  listDroneProfiles: vi.fn().mockResolvedValue({
    data: [
      {
        id: "dp-1",
        name: "DJI Matrice 300",
        manufacturer: "DJI",
        model: "Matrice 300",
        max_speed: 23,
        max_climb_rate: 6,
        max_altitude: 5000,
        battery_capacity: 5935,
        endurance_minutes: 55,
        camera_resolution: "20MP",
        camera_frame_rate: 30,
        sensor_fov: 84,
        weight: 6.3,
      },
    ],
    meta: { total: 1 },
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderDashboard(airport?: object) {
  if (airport) {
    localStorage.setItem("tarmacview_airport", JSON.stringify(airport));
  }
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

const mockAirport = {
  id: "apt-1",
  icao_code: "LZIB",
  name: "Bratislava",
  city: "Bratislava",
  country: "Slovakia",
  elevation: 133,
  location: { type: "Point", coordinates: [17.21, 48.17, 133] },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("shows airport selection when no airport is selected", () => {
    renderDashboard();
    expect(
      screen.getByPlaceholderText("airportSelection.searchPlaceholder"),
    ).toBeInTheDocument();
  });

  it("shows dashboard with mission list when airport is selected", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });
    expect(screen.getByText("Alpha Mission")).toBeInTheDocument();
  });

  it("filters missions by search", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("mission-search");
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    expect(screen.queryByText("Test Mission")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha Mission")).toBeInTheDocument();
  });

  it("navigates to mission overview on row click", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("mission-row-m-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("mission-row-m-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/operator-center/missions/m-1/overview");
  });

  it("opens create mission dialog", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("new-mission-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-mission-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });
  });

  it("validates create mission form - empty name", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("new-mission-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-mission-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });

    // submit without filling in fields
    fireEvent.submit(screen.getByTestId("create-mission-form"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toBeInTheDocument();
    });
  });

  it("shows statistics section", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("dashboard.statistics")).toBeInTheDocument();
    });
    expect(screen.getByText("94%")).toBeInTheDocument();
  });

  it("shows drone profiles section", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("DJI Matrice 300")).toBeInTheDocument();
    });
  });

  it("renders map component when airport detail is loaded", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("airport-map")).toBeInTheDocument();
    });
  });

  it("shows collapsible sections that can toggle", async () => {
    renderDashboard(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("dashboard.statistics")).toBeInTheDocument();
    });

    // the statistics section header - click to collapse
    const sectionBtn = screen.getByTestId("section-dashboard.statistics");
    fireEvent.click(sectionBtn);

    // after collapse, the stat values should not be visible
    expect(screen.queryByText("94%")).not.toBeInTheDocument();
  });
});
