import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InspectionListPage from "./InspectionListPage";

// stable t reference to avoid infinite re-render from useCallback([..., t])
const stableT = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: stableT, i18n: { language: "en" } }),
}));

const mockAirportDetail = {
  id: "apt-1",
  icao_code: "LZIB",
  name: "Bratislava",
  city: "Bratislava",
  country: "Slovakia",
  elevation: 133,
  location: { type: "Point", coordinates: [17.21, 48.17, 133] },
  surfaces: [
    {
      id: "srf-1",
      airport_id: "apt-1",
      identifier: "RWY 22",
      surface_type: "RUNWAY",
      geometry: { type: "LineString", coordinates: [] },
      heading: 220,
      length: 3190,
      width: 45,
      threshold_position: null,
      end_position: null,
      taxiway_width: null,
      agls: [
        {
          id: "agl-1",
          surface_id: "srf-1",
          agl_type: "PAPI",
          name: "PAPI RWY 22",
          position: { type: "Point", coordinates: [17.21, 48.17, 133] },
          side: "LEFT",
          glide_slope_angle: 3.0,
          distance_from_threshold: 300,
          offset_from_centerline: 15,
          lhas: [],
        },
      ],
    },
  ],
  obstacles: [],
  safety_zones: [],
};

vi.mock("@/contexts/AirportContext", () => ({
  useAirport: () => ({
    airportDetail: mockAirportDetail,
    selectedAirport: mockAirportDetail,
    airportDetailLoading: false,
    airportDetailError: false,
    selectAirport: vi.fn(),
    clearAirport: vi.fn(),
    refreshAirportDetail: vi.fn(),
  }),
}));

vi.mock("@/api/inspectionTemplates", () => ({
  listInspectionTemplates: vi.fn().mockResolvedValue({
    data: [
      {
        id: "tpl-1",
        name: "PAPI RWY 22 - Angular Sweep",
        description: null,
        angular_tolerances: null,
        created_by: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        default_config: null,
        target_agl_ids: ["agl-1"],
        methods: ["ANGULAR_SWEEP"],
        mission_count: 0,
      },
      {
        id: "tpl-2",
        name: "PAPI RWY 04 - Vertical Profile",
        description: null,
        angular_tolerances: null,
        created_by: null,
        created_at: "2026-03-10T00:00:00Z",
        updated_at: "2026-03-10T00:00:00Z",
        default_config: null,
        target_agl_ids: ["agl-1"],
        methods: ["VERTICAL_PROFILE"],
        mission_count: 0,
      },
    ],
    meta: { total: 2 },
  }),
  createInspectionTemplate: vi.fn().mockResolvedValue({
    id: "tpl-new",
    name: "New Template",
    methods: ["ANGULAR_SWEEP"],
    target_agl_ids: ["agl-1"],
    mission_count: 0,
  }),
  deleteInspectionTemplate: vi.fn().mockResolvedValue({ deleted: true }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

/** render the inspection list page. */
function renderPage() {
  return render(
    <MemoryRouter>
      <InspectionListPage />
    </MemoryRouter>,
  );
}

describe("InspectionListPage", () => {
  /** test suite for the inspection list page. */
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders template table after data loads", async () => {
    /** verify templates appear in the table. */
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PAPI RWY 22 - Angular Sweep")).toBeInTheDocument();
    });
    expect(screen.getByText("PAPI RWY 04 - Vertical Profile")).toBeInTheDocument();
  });

  it("filters templates by search input", async () => {
    /** verify search narrows visible rows. */
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PAPI RWY 22 - Angular Sweep")).toBeInTheDocument();
    });
    const searchInput = screen.getByTestId("template-search");
    fireEvent.change(searchInput, { target: { value: "RWY 04" } });
    expect(screen.queryByText("PAPI RWY 22 - Angular Sweep")).not.toBeInTheDocument();
    expect(screen.getByText("PAPI RWY 04 - Vertical Profile")).toBeInTheDocument();
  });

  it("navigates to edit page on row click", async () => {
    /** verify clicking a row navigates to the template detail. */
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("template-row-tpl-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("template-row-tpl-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/inspections/tpl-1");
  });

  it("shows error state when fetch fails", async () => {
    /** verify error message displays on api failure. */
    const { listInspectionTemplates } = await import("@/api/inspectionTemplates");
    vi.mocked(listInspectionTemplates).mockRejectedValueOnce(new Error("Network error"));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(screen.getByText("common.retry")).toBeInTheDocument();
  });

  it("opens create dialog on add button click", async () => {
    /** verify add button shows the create template dialog. */
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("inspection-list-page")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("coordinator.inspections.addNew"));
    await waitFor(() => {
      expect(screen.getByText("coordinator.inspections.createTitle")).toBeInTheDocument();
    });
  });
});
