import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import MissionListPage from "./MissionListPage";

// mock api modules
vi.mock("@/api/airports", () => ({
  listAirportSummaries: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  getAirport: vi.fn().mockResolvedValue({
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    surfaces: [],
    obstacles: [],
    safety_zones: [],
    city: "Bratislava",
    country: "Slovakia",
    elevation: 133,
    location: { type: "Point", coordinates: [17.21, 48.17, 133] },
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
        drone_profile_id: "dp-1",
        created_at: "2026-03-01T00:00:00Z",
        operator_notes: null,
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
        drone_profile_id: null,
        created_at: "2026-03-10T00:00:00Z",
        operator_notes: null,
        date_time: null,
        default_speed: null,
        default_altitude_offset: null,
        takeoff_coordinate: null,
        landing_coordinate: null,
      },
    ],
    meta: { total: 2 },
  }),
  deleteMission: vi.fn().mockResolvedValue({}),
  duplicateMission: vi
    .fn()
    .mockResolvedValue({ id: "m-3", name: "Test Mission (copy)" }),
  updateMission: vi.fn().mockResolvedValue({}),
  createMission: vi.fn().mockResolvedValue({
    id: "m-new",
    name: "New",
    status: "DRAFT",
    airport_id: "apt-1",
  }),
}));

vi.mock("@/api/droneProfiles", () => ({
  listDroneProfiles: vi.fn().mockResolvedValue({
    data: [{ id: "dp-1", name: "DJI Matrice 300" }],
    meta: { total: 1 },
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAirport = {
  id: "apt-1",
  icao_code: "LZIB",
  name: "Bratislava",
  city: "Bratislava",
  country: "Slovakia",
  elevation: 133,
  location: { type: "Point", coordinates: [17.21, 48.17, 133] },
};

/** render the mission list page with optional airport in localStorage. */
function renderPage(airport?: object) {
  if (airport) {
    localStorage.setItem("tarmacview_airport", JSON.stringify(airport));
  }
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <AirportProvider>
            <MemoryRouter>
              <MissionListPage />
            </MemoryRouter>
          </AirportProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("MissionListPage", () => {
  /** test suite for the mission list page. */
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("shows select airport message when no airport is selected", () => {
    /** verify the placeholder is shown without an airport. */
    renderPage();
    expect(screen.getByText("nav.selectAirport")).toBeInTheDocument();
  });

  it("renders mission list when airport is selected", async () => {
    /** verify missions load and display in the table. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });
    expect(screen.getByText("Alpha Mission")).toBeInTheDocument();
  });

  it("filters missions by search input", async () => {
    /** verify typing in search hides non-matching rows. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("mission-list-search");
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    expect(screen.queryByText("Test Mission")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha Mission")).toBeInTheDocument();
  });

  it("toggles status filter pills", async () => {
    /** verify clicking a status pill removes matching missions. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });

    // deactivate DRAFT status - should hide "Test Mission"
    fireEvent.click(screen.getByTestId("status-filter-DRAFT"));
    expect(screen.queryByText("Test Mission")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha Mission")).toBeInTheDocument();

    // re-activate DRAFT - should show it again
    fireEvent.click(screen.getByTestId("status-filter-DRAFT"));
    expect(screen.getByText("Test Mission")).toBeInTheDocument();
  });

  it("navigates to mission overview on row click", async () => {
    /** verify clicking a row calls navigate with the correct path. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("mission-row-m-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("mission-row-m-1"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/operator-center/missions/m-1/overview",
    );
  });

  it("shows delete confirmation and deletes on confirm", async () => {
    /** verify the delete flow opens modal and calls deleteMission. */
    const { deleteMission } = await import("@/api/missions");
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("mission-row-m-1")).toBeInTheDocument();
    });

    // click the inline delete action button
    const row = screen.getByTestId("mission-row-m-1");
    const deleteBtn = within(row).getByTitle("missionList.actions.delete");
    fireEvent.click(deleteBtn);

    // confirmation modal should appear
    await waitFor(() => {
      expect(screen.getByTestId("modal-overlay")).toBeInTheDocument();
    });

    // confirm deletion - find the danger button (second "common.delete" text)
    const deleteButtons = screen.getAllByText("common.delete");
    const confirmBtn = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteMission).toHaveBeenCalledWith("m-1");
    });
  });

  it("opens create mission dialog on new mission button click", async () => {
    /** verify the create dialog appears when clicking the new mission button. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByTestId("new-mission-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-mission-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });
  });

  it("shows error state with retry button", async () => {
    /** verify error state renders and retry re-fetches. */
    const { listMissions } = await import("@/api/missions");
    (listMissions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network error"),
    );

    renderPage(mockAirport);

    await waitFor(() => {
      expect(
        screen.getByText("missionList.loadError"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("common.retry")).toBeInTheDocument();

    // click retry should call listMissions again
    fireEvent.click(screen.getByText("common.retry"));
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });
  });

  it("sorts missions by column header click", async () => {
    /** verify clicking a column header changes sort order. */
    renderPage(mockAirport);
    await waitFor(() => {
      expect(screen.getByText("Test Mission")).toBeInTheDocument();
    });

    // default sort is created_at desc, so m-2 (2026-03-10) should appear before m-1 (2026-03-01)
    const rows = screen.getAllByTestId(/^mission-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "mission-row-m-2");
    expect(rows[1]).toHaveAttribute("data-testid", "mission-row-m-1");

    // click name column header to sort by name ascending
    fireEvent.click(screen.getByText("missionList.columns.name"));

    const sortedRows = screen.getAllByTestId(/^mission-row-/);
    // "Alpha Mission" < "Test Mission" alphabetically
    expect(sortedRows[0]).toHaveAttribute("data-testid", "mission-row-m-2");
    expect(sortedRows[1]).toHaveAttribute("data-testid", "mission-row-m-1");

    // click name again to toggle to descending
    fireEvent.click(screen.getByText("missionList.columns.name"));

    const descRows = screen.getAllByTestId(/^mission-row-/);
    expect(descRows[0]).toHaveAttribute("data-testid", "mission-row-m-1");
    expect(descRows[1]).toHaveAttribute("data-testid", "mission-row-m-2");
  });
});
