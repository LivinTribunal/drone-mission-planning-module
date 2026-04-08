import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MissionOverviewPage from "./MissionOverviewPage";

const mockNavigate = vi.fn();
const mockSetSaveContext = vi.fn();
const mockSetComputeContext = vi.fn();
const mockRefreshMissions = vi.fn();
const mockUpdateMissionFromPage = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useOutletContext: () => {
      // create a portal target so portaled left panel content renders in tests
      let el = document.getElementById("left-panel-portal");
      if (!el) {
        el = document.createElement("div");
        el.id = "left-panel-portal";
        document.body.appendChild(el);
      }
      return {
        setSaveContext: mockSetSaveContext,
        setComputeContext: mockSetComputeContext,
        refreshMissions: mockRefreshMissions,
        updateMissionFromPage: mockUpdateMissionFromPage,
        leftPanelEl: el,
      };
    },
  };
});

vi.mock("@/api/missions", () => ({
  getMission: vi.fn(),
  getFlightPlan: vi.fn(),
}));

vi.mock("@/api/droneProfiles", () => ({
  listDroneProfiles: vi.fn(),
}));

vi.mock("@/contexts/AirportContext", () => ({
  useAirport: () => ({
    airportDetail: {
      id: "apt-1",
      name: "Test Airport",
      icao_code: "LZTT",
      location: { type: "Point", coordinates: [17.0, 48.0, 0] },
      surfaces: [
        {
          id: "s-1",
          identifier: "09/27",
          surface_type: "RUNWAY",
          agls: [],
          buffer_distance: 5.0,
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
        },
      ],
      obstacles: [],
      safety_zones: [],
    },
    selectedAirport: { id: "apt-1", name: "Test Airport" },
  }),
}));

vi.mock("@/components/map/AirportMap", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="airport-map">{props.children as React.ReactNode}</div>
  ),
}));

vi.mock("@/components/map/overlays/TerrainToggle", () => ({
  default: () => <button data-testid="terrain-toggle">terrain</button>,
}));

import { getMission, getFlightPlan } from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";

const baseMission = {
  id: "m-1",
  name: "Test Mission",
  status: "PLANNED",
  airport_id: "apt-1",
  drone_profile_id: "dp-1",
  default_speed: 5,
  default_altitude_offset: 10,
  takeoff_coordinate: null,
  landing_coordinate: null,
  operator_notes: "some notes",
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-05T14:30:00Z",
  date_time: null,
  inspections: [
    {
      id: "i-1",
      mission_id: "m-1",
      template_id: "t-1",
      config_id: null,
      method: "ANGULAR_SWEEP",
      sequence_order: 1,
      lha_ids: null,
      config: null,
    },
  ],
};

const baseFlightPlan = {
  id: "fp-1",
  mission_id: "m-1",
  airport_id: "apt-1",
  total_distance: 1500,
  estimated_duration: 360,
  is_validated: true,
  generated_at: "2026-03-05T14:00:00Z",
  waypoints: [],
  validation_result: {
    id: "vr-1",
    passed: true,
    validated_at: "2026-03-05T14:00:00Z",
    violations: [],
  },
};

function setupMocks(overrides?: {
  missionError?: boolean;
  flightPlanError?: boolean;
}) {
  /** configure api mocks for a single test. */
  if (overrides?.missionError) {
    vi.mocked(getMission).mockRejectedValue(new Error("fail"));
  } else {
    vi.mocked(getMission).mockResolvedValue(baseMission as never);
  }

  if (overrides?.flightPlanError) {
    vi.mocked(getFlightPlan).mockRejectedValue(new Error("404"));
  } else {
    vi.mocked(getFlightPlan).mockResolvedValue(baseFlightPlan as never);
  }

  vi.mocked(listDroneProfiles).mockResolvedValue({
    data: [{ id: "dp-1", name: "DJI Matrice 300", endurance_minutes: 45 }],
  } as never);
}

function renderPage() {
  /** render the overview page within a router context. */
  return render(
    <MemoryRouter initialEntries={["/operator-center/missions/m-1/overview"]}>
      <Routes>
        <Route
          path="/operator-center/missions/:id/overview"
          element={<MissionOverviewPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MissionOverviewPage", () => {
  /** tests for the mission overview page. */

  it("renders the overview page after loading", async () => {
    /** verify the page renders with correct test id. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("mission-overview-page")).toBeInTheDocument();
    });
  });

  it("shows mission info panel", async () => {
    /** verify mission info panel is rendered. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("mission-info-panel")).toBeInTheDocument();
    });
  });

  it("shows status badge", async () => {
    /** verify the status badge is rendered. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("missionStatus.PLANNED")).toBeInTheDocument();
    });
  });

  it("shows all left panel sections", async () => {
    /** verify all panel sections are present. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("warnings-panel")).toBeInTheDocument();
      expect(screen.getByTestId("stats-panel")).toBeInTheDocument();
      expect(screen.getByTestId("validation-status-panel")).toBeInTheDocument();
    });
  });

  it("renders the airport map", async () => {
    /** verify map container is rendered. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("airport-map")).toBeInTheDocument();
    });
  });

  it("shows bottom bar navigation buttons", async () => {
    /** verify bottom bar buttons. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("open-map-btn")).toBeInTheDocument();
    });
  });

  it("navigates to map tab when open map is clicked", async () => {
    /** verify open map button navigates to map tab. */
    setupMocks();
    renderPage();
    const btn = await screen.findByTestId("open-map-btn");
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/operator-center/missions/m-1/map",
    );
  });

  it("shows no-data states when flight plan is missing", async () => {
    /** verify empty state messages when no trajectory exists. */
    setupMocks({ flightPlanError: true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("mission-overview-page")).toBeInTheDocument();
    });

    // flight plan fetch runs after mission loads, wait for it to settle
    await waitFor(() => {
      expect(
        screen.getByText("mission.config.computeToSeeStats"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("mission.overview.noFlightPlan"),
      ).toBeInTheDocument();
    });
  });

  it("shows error state when mission fails to load", async () => {
    /** verify error message and retry button on load failure. */
    setupMocks({ missionError: true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("mission.config.loadError")).toBeInTheDocument();
      expect(screen.getByText("common.retry")).toBeInTheDocument();
    });
  });

  it("shows operator notes when present", async () => {
    /** verify operator notes are displayed. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("some notes")).toBeInTheDocument();
    });
  });

  it("shows runway identifier from airport surfaces", async () => {
    /** verify runway info is displayed. */
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("09/27")).toBeInTheDocument();
    });
  });
});
