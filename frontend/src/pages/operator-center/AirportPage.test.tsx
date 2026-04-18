import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import AirportPage from "./AirportPage";

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
    surfaces: [
      {
        id: "s-1",
        airport_id: "apt-1",
        identifier: "06/24",
        surface_type: "RUNWAY",
        geometry: { type: "LineString", coordinates: [[17.2, 48.1, 0], [17.3, 48.2, 0]] },
        boundary: null,
        buffer_distance: 5.0,
        heading: 60,
        length: 3500,
        width: 45,
        threshold_position: null,
        end_position: null,
        agls: [
          {
            id: "agl-1",
            surface_id: "s-1",
            agl_type: "PAPI",
            name: "PAPI RWY 06/24 (Left side)",
            position: { type: "Point", coordinates: [17.21, 48.17, 133] },
            side: "LEFT",
            glide_slope_angle: 3.0,
            distance_from_threshold: 300,
            offset_from_centerline: 15,
            lhas: [
              {
                id: "lha-1",
                agl_id: "agl-1",
                unit_number: 1,
                setting_angle: 2.83,
                transition_sector_width: null,
                lamp_type: "HALOGEN",
                position: { type: "Point", coordinates: [17.2105, 48.1705, 133] },
              },
            ],
          },
        ],
      },
      {
        id: "s-2",
        airport_id: "apt-1",
        identifier: "Alpha",
        surface_type: "TAXIWAY",
        geometry: { type: "LineString", coordinates: [[17.2, 48.1, 0], [17.25, 48.15, 0]] },
        boundary: null,
        buffer_distance: 5.0,
        heading: null,
        length: 800,
        width: 23,
        threshold_position: null,
        end_position: null,
        agls: [],
      },
    ],
    obstacles: [
      {
        id: "o-1",
        airport_id: "apt-1",
        name: "Control Tower",
        height: 45,
        boundary: { type: "Polygon", coordinates: [[[17.2, 48.1, 150], [17.21, 48.1, 150], [17.21, 48.11, 150], [17.2, 48.11, 150], [17.2, 48.1, 150]]] },
        buffer_distance: 5.0,
        type: "BUILDING",
      },
    ],
    safety_zones: [
      {
        id: "sz-1",
        airport_id: "apt-1",
        name: "CTR Zone Alpha",
        type: "CTR",
        geometry: { type: "Polygon", coordinates: [[[17.0, 48.0], [17.4, 48.0], [17.4, 48.3], [17.0, 48.3], [17.0, 48.0]]] },
        altitude_floor: 0,
        altitude_ceiling: 2500,
        is_active: true,
      },
    ],
  }),
}));

// mock AirportMap since maplibre doesn't work in jsdom
vi.mock("@/components/map/AirportMap", () => ({
  default: ({ leftPanelChildren, children }: { leftPanelChildren?: React.ReactNode; children?: React.ReactNode }) => (
    <div data-testid="airport-map">
      <div data-testid="left-panel">{leftPanelChildren}</div>
      <div data-testid="map-children">{children}</div>
    </div>
  ),
}));

vi.mock("@/components/map/overlays/LegendPanel", () => ({
  default: () => <div data-testid="legend-panel" />,
}));

vi.mock("@/components/map/overlays/PoiInfoPanel", () => ({
  default: ({ feature, onClose }: { feature: unknown; onClose: () => void }) =>
    feature ? (
      <div data-testid="poi-info-panel">
        <button data-testid="poi-close" onClick={onClose}>close</button>
      </div>
    ) : null,
}));

vi.mock("@/components/map/overlays/TerrainToggle", () => ({
  default: () => <div data-testid="terrain-toggle" />,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
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

function renderAirportPage(airport?: object) {
  /** render airport page with providers. */
  if (airport) {
    localStorage.setItem("tarmacview_airport", JSON.stringify(airport));
  }
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <MemoryRouter>
            <AirportPage />
          </MemoryRouter>
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("AirportPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("redirects to dashboard when no airport is selected", () => {
    renderAirportPage();
    expect(mockNavigate).toHaveBeenCalledWith("/operator-center", { replace: true });
  });

  it("renders map and panels when airport is selected", async () => {
    renderAirportPage(mockAirport);
    const map = await screen.findByTestId("airport-map");
    expect(map).toBeInTheDocument();
  });

  it("renders ground surfaces panel with surfaces", async () => {
    renderAirportPage(mockAirport);
    const panel = await screen.findByTestId("ground-surfaces-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("RWY 06/24")).toBeInTheDocument();
    expect(screen.getByText("TWY Alpha")).toBeInTheDocument();
  });

  it("renders obstacles panel with obstacles", async () => {
    renderAirportPage(mockAirport);
    const panel = await screen.findByTestId("obstacles-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Control Tower")).toBeInTheDocument();
  });

  it("renders safety zones panel with zones", async () => {
    renderAirportPage(mockAirport);
    const panel = await screen.findByTestId("safety-zones-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("CTR Zone Alpha")).toBeInTheDocument();
  });

  it("renders agl panel with agl systems", async () => {
    renderAirportPage(mockAirport);
    const panel = await screen.findByTestId("agl-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("PAPI RWY 06/24 (Left side)")).toBeInTheDocument();
  });

  it("renders legend panel", async () => {
    renderAirportPage(mockAirport);
    const legend = await screen.findByTestId("legend-panel");
    expect(legend).toBeInTheDocument();
  });

  it("renders terrain toggle", async () => {
    renderAirportPage(mockAirport);
    const toggle = await screen.findByTestId("terrain-toggle");
    expect(toggle).toBeInTheDocument();
  });

  it("collapses ground surfaces panel when chevron clicked", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("RWY 06/24");

    const panel = screen.getByTestId("ground-surfaces-panel");
    const collapseBtn = panel.querySelector("button");
    if (collapseBtn) fireEvent.click(collapseBtn);

    expect(screen.queryByText("RWY 06/24")).not.toBeInTheDocument();
  });

  it("shows dimensions for surfaces", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("RWY 06/24");
    expect(screen.getByText("3500m × 45m")).toBeInTheDocument();
  });

  it("shows obstacle height", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("Control Tower");
    expect(screen.getByText(/poiHeight.*45m/)).toBeInTheDocument();
  });

  it("shows safety zone altitude range and active status", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("CTR Zone Alpha");
    expect(screen.getByText("0m — 2500m")).toBeInTheDocument();
    expect(screen.getByText("airport.active")).toBeInTheDocument();
  });

  it("shows lha count for agl systems", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("PAPI RWY 06/24 (Left side)");
    expect(screen.getByText(/1.*airport\.units/)).toBeInTheDocument();
  });

  it("expands agl to show lha sub-items", async () => {
    renderAirportPage(mockAirport);
    await screen.findByText("PAPI RWY 06/24 (Left side)");

    fireEvent.click(screen.getByTestId("agl-item-agl-1"));
    expect(screen.getByText("airport.lhaUnit")).toBeInTheDocument();
    expect(screen.getByText("2.83°")).toBeInTheDocument();
  });
});
