import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SafetyZonesPanel from "./SafetyZonesPanel";
import type { SafetyZoneResponse } from "@/types/airport";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";

function zone(overrides: Partial<SafetyZoneResponse> = {}): SafetyZoneResponse {
  /** build a minimal safety zone for tests. */
  return {
    id: "z1",
    airport_id: "a1",
    name: "Zone",
    type: "CTR",
    geometry: { type: "Polygon", coordinates: [] },
    altitude_floor: 0,
    altitude_ceiling: 500,
    is_active: true,
    ...overrides,
  } as SafetyZoneResponse;
}

const layerConfig = DEFAULT_LAYER_CONFIG;

describe("SafetyZonesPanel boundary row", () => {
  it("renders the boundary row and invokes onSelect with the boundary zone", () => {
    const boundary = zone({
      id: "b1",
      name: "OurFence",
      type: "AIRPORT_BOUNDARY",
      altitude_floor: null,
      altitude_ceiling: null,
    });
    const regular = zone({ id: "z2", name: "Alpha", type: "CTR" });
    const onSelect = vi.fn();

    render(
      <SafetyZonesPanel
        safetyZones={[boundary, regular]}
        layerConfig={layerConfig}
        onSelect={onSelect}
      />,
    );

    const row = screen.getByTestId(`boundary-item-${boundary.id}`);
    expect(row).toBeInTheDocument();
    expect(screen.getByText("OurFence")).toBeInTheDocument();
    expect(screen.getByText("boundary.airportBoundary")).toBeInTheDocument();

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith({ type: "safety_zone", data: boundary });
  });

  it("renders the empty-state row when no boundary exists", () => {
    render(
      <SafetyZonesPanel
        safetyZones={[zone({ id: "z1", type: "CTR" })]}
        layerConfig={layerConfig}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("boundary-item-empty")).toBeInTheDocument();
    expect(screen.getByText("boundary.noBoundary")).toBeInTheDocument();
  });

  it("excludes boundary from the regular zone count", () => {
    render(
      <SafetyZonesPanel
        safetyZones={[
          zone({ id: "b1", type: "AIRPORT_BOUNDARY" }),
          zone({ id: "z1", type: "CTR" }),
          zone({ id: "z2", type: "RESTRICTED" }),
        ]}
        layerConfig={layerConfig}
        onSelect={vi.fn()}
      />,
    );

    // the count badge shows number of non-boundary zones
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
