import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import InspectionEditPage from "./InspectionEditPage";

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
      boundary: null,
      buffer_distance: 5.0,
      heading: 220,
      length: 3190,
      width: 45,
      threshold_position: null,
      end_position: null,
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
          lhas: [
            {
              id: "lha-1",
              agl_id: "agl-1",
              unit_designator: "A",
              setting_angle: 2.5,
              transition_sector_width: null,
              lamp_type: "LED",
              position: { type: "Point", coordinates: [17.21, 48.17, 133] },
            },
          ],
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
  getInspectionTemplate: vi.fn().mockResolvedValue({
    id: "tpl-1",
    name: "PAPI RWY 22 - Horizontal Range",
    description: null,
    angular_tolerances: null,
    created_by: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-15T10:00:00Z",
    default_config: {
      id: "cfg-1",
      altitude_offset: 5,
      measurement_speed_override: null,
      measurement_density: null,
      custom_tolerances: null,
      hover_duration: null,
      horizontal_distance: null,
      sweep_angle: null,
      lha_ids: ["lha-1"],
    },
    target_agl_ids: ["agl-1"],
    methods: ["HORIZONTAL_RANGE"],
    mission_count: 0,
  }),
  listInspectionTemplates: vi.fn().mockResolvedValue({
    data: [
      {
        id: "tpl-1",
        name: "PAPI RWY 22 - Horizontal Range",
        description: null,
        angular_tolerances: null,
        created_by: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-15T10:00:00Z",
        default_config: null,
        target_agl_ids: ["agl-1"],
        methods: ["HORIZONTAL_RANGE"],
        mission_count: 0,
      },
    ],
    meta: { total: 1 },
  }),
  updateInspectionTemplate: vi.fn().mockResolvedValue({
    id: "tpl-1",
    name: "PAPI RWY 22 - Horizontal Range",
    description: null,
    angular_tolerances: null,
    created_by: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-15T10:00:00Z",
    default_config: null,
    target_agl_ids: ["agl-1"],
    methods: ["HORIZONTAL_RANGE"],
    mission_count: 0,
  }),
  deleteInspectionTemplate: vi.fn().mockResolvedValue({ deleted: true }),
  createInspectionTemplate: vi.fn().mockResolvedValue({
    id: "tpl-new",
    name: "PAPI RWY 22 - Horizontal Range (Copy)",
    methods: ["HORIZONTAL_RANGE"],
    target_agl_ids: ["agl-1"],
    mission_count: 0,
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

/** render the edit page with a template id in the url. */
function renderPage(templateId = "tpl-1") {
  return render(
    <MemoryRouter initialEntries={[`/coordinator-center/inspections/${templateId}`]}>
      <Routes>
        <Route path="/coordinator-center/inspections/:id" element={<InspectionEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InspectionEditPage", () => {
  /** test suite for the inspection edit page. */
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders template name after load", async () => {
    /** verify template data appears. */
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText("PAPI RWY 22 - Horizontal Range");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows error state when fetch fails", async () => {
    /** verify error message on api failure. */
    const { getInspectionTemplate } = await import("@/api/inspectionTemplates");
    vi.mocked(getInspectionTemplate).mockRejectedValueOnce(new Error("Network error"));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(screen.getByText("common.retry")).toBeInTheDocument();
  });

  it("autosaves after changing a config field", async () => {
    /** verify changing config triggers autosave. */
    const { updateInspectionTemplate } = await import("@/api/inspectionTemplates");
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText("PAPI RWY 22 - Horizontal Range");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    const altitudeInput = screen.getByDisplayValue("5");
    fireEvent.change(altitudeInput, { target: { value: "10" } });

    // advance past the autosave debounce delay
    vi.advanceTimersByTime(1500);

    await waitFor(() => {
      expect(updateInspectionTemplate).toHaveBeenCalledWith("tpl-1", expect.any(Object));
    });
  });

  it("delete opens confirmation and navigates away", async () => {
    /** verify delete flow with confirmation modal. */
    const { deleteInspectionTemplate } = await import("@/api/inspectionTemplates");
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText("PAPI RWY 22 - Horizontal Range");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    // action buttons are now icon buttons with title attributes
    const deleteBtn = screen.getByTitle("coordinator.inspections.deleteTemplate");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText("common.delete")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("common.delete"));
    await waitFor(() => {
      expect(deleteInspectionTemplate).toHaveBeenCalledWith("tpl-1");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/inspections");
  });

  it("duplicate calls create and navigates to new template", async () => {
    /** verify duplicate creates a copy and redirects. */
    const { createInspectionTemplate } = await import("@/api/inspectionTemplates");
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText("PAPI RWY 22 - Horizontal Range");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    const dupBtn = screen.getByTitle("coordinator.inspections.duplicateTemplate");
    fireEvent.click(dupBtn);

    await waitFor(() => {
      expect(createInspectionTemplate).toHaveBeenCalled();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/inspections/tpl-new");
  });
});
