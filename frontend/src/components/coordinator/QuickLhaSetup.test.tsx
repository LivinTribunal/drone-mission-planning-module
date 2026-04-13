import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditableFeatureInfo from "./EditableFeatureInfo";
import type { SurfaceResponse, AGLResponse } from "@/types/airport";
import type { MapFeature } from "@/types/map";

vi.mock("@/api/airports", () => ({
  bulkCreateLHAs: vi.fn(),
  recalculateSurface: vi.fn(),
  recalculateObstacle: vi.fn(),
}));

import { bulkCreateLHAs } from "@/api/airports";

const agl: AGLResponse = {
  id: "agl-1",
  surface_id: "surf-1",
  agl_type: "RUNWAY_EDGE_LIGHTS",
  name: "EDGE LIGHTS RWY 06/24",
  position: { type: "Point", coordinates: [17.0, 48.0, 133] },
  side: null,
  glide_slope_angle: null,
  distance_from_threshold: null,
  offset_from_centerline: null,
  lhas: [],
};

const surface: SurfaceResponse = {
  id: "surf-1",
  airport_id: "apt-1",
  identifier: "06/24",
  surface_type: "RUNWAY",
  geometry: { type: "LineString", coordinates: [[17.0, 48.0, 133], [17.02, 48.0, 133]] },
  boundary: null,
  buffer_distance: 5,
  heading: 90,
  length: 3000,
  width: 45,
  threshold_position: null,
  end_position: null,
  touchpoint_latitude: null,
  touchpoint_longitude: null,
  touchpoint_altitude: null,
  agls: [agl],
};

const feature: MapFeature = { type: "agl", data: agl };

describe("QuickLhaSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed by default and expands on click", () => {
    render(
      <EditableFeatureInfo
        feature={feature}
        onUpdate={() => {}}
        onClose={() => {}}
        airportId="apt-1"
        surfaces={[surface]}
      />,
    );
    const container = screen.getByTestId("quick-lha-setup");
    expect(container).toBeInTheDocument();
    // collapsed: generate button hidden
    expect(screen.queryByTestId("qls-generate-button")).not.toBeInTheDocument();

    // expand
    fireEvent.click(container.querySelector("button")!);
    expect(screen.getByTestId("qls-generate-button")).toBeInTheDocument();
  });

  it("calls bulkCreateLHAs with setting_angle=0 for edge lights", async () => {
    const mockBulk = bulkCreateLHAs as unknown as ReturnType<typeof vi.fn>;
    mockBulk.mockResolvedValue({ generated: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] });

    render(
      <EditableFeatureInfo
        feature={feature}
        onUpdate={() => {}}
        onClose={() => {}}
        airportId="apt-1"
        surfaces={[surface]}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-lha-setup").querySelector("button")!);

    // fill positions
    fireEvent.change(screen.getByLabelText(/map.coordinates.lat/i, { selector: "#qls-first-lat" }), {
      target: { value: "48.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lon/i, { selector: "#qls-first-lon" }), {
      target: { value: "17.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lat/i, { selector: "#qls-last-lat" }), {
      target: { value: "48.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lon/i, { selector: "#qls-last-lon" }), {
      target: { value: "17.01" },
    });

    fireEvent.click(screen.getByTestId("qls-generate-button"));

    await waitFor(() => {
      expect(mockBulk).toHaveBeenCalled();
    });
    const call = mockBulk.mock.calls[0];
    expect(call[0]).toBe("apt-1");
    expect(call[1]).toBe("surf-1");
    expect(call[2]).toBe("agl-1");
    expect(call[3]).toMatchObject({ setting_angle: 0, spacing_m: 3 });
  });

  it("passes setting_angle=null for PAPI AGLs", async () => {
    const mockBulk = bulkCreateLHAs as unknown as ReturnType<typeof vi.fn>;
    mockBulk.mockResolvedValue({ generated: [{ id: "l1" }] });

    const papiAgl = { ...agl, agl_type: "PAPI", name: "PAPI RWY 06/24" };
    const papiSurface = { ...surface, agls: [papiAgl] };

    render(
      <EditableFeatureInfo
        feature={{ type: "agl", data: papiAgl }}
        onUpdate={() => {}}
        onClose={() => {}}
        airportId="apt-1"
        surfaces={[papiSurface]}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-lha-setup").querySelector("button")!);

    fireEvent.change(screen.getByLabelText(/map.coordinates.lat/i, { selector: "#qls-first-lat" }), {
      target: { value: "48.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lon/i, { selector: "#qls-first-lon" }), {
      target: { value: "17.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lat/i, { selector: "#qls-last-lat" }), {
      target: { value: "48.0" },
    });
    fireEvent.change(screen.getByLabelText(/map.coordinates.lon/i, { selector: "#qls-last-lon" }), {
      target: { value: "17.01" },
    });

    fireEvent.click(screen.getByTestId("qls-generate-button"));

    await waitFor(() => {
      expect(mockBulk).toHaveBeenCalled();
    });
    expect(mockBulk.mock.calls[0][3]).toMatchObject({ setting_angle: null });
  });

  it("validates missing coordinates", async () => {
    render(
      <EditableFeatureInfo
        feature={feature}
        onUpdate={() => {}}
        onClose={() => {}}
        airportId="apt-1"
        surfaces={[surface]}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-lha-setup").querySelector("button")!);
    fireEvent.click(screen.getByTestId("qls-generate-button"));

    await waitFor(() => {
      expect(
        screen.getByText("coordinator.agl.quickSetupInvalidPositions"),
      ).toBeInTheDocument();
    });
  });
});
