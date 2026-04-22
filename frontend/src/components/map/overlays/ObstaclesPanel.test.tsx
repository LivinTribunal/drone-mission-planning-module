import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ObstaclesPanel from "./ObstaclesPanel";
import type { ObstacleResponse } from "@/types/airport";
import { DEFAULT_LAYER_CONFIG } from "@/types/map";

function obstacle(overrides: Partial<ObstacleResponse> = {}): ObstacleResponse {
  return {
    id: "o1",
    airport_id: "a1",
    name: "Tower",
    type: "TOWER",
    boundary: {
      type: "Polygon",
      coordinates: [[[14.5, 50.1], [14.6, 50.1], [14.55, 50.2], [14.5, 50.1]]],
    },
    height: 50,
    ...overrides,
  } as ObstacleResponse;
}

describe("ObstaclesPanel click behavior", () => {
  it("single-click calls onSelect only, not onLocate", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    const o = obstacle({ id: "o-x" });
    render(
      <ObstaclesPanel
        obstacles={[o]}
        layerConfig={DEFAULT_LAYER_CONFIG}
        onSelect={onSelect}
        onLocate={onLocate}
      />,
    );

    const row = screen.getByTestId("obstacle-item-o-x");
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith({ type: "obstacle", data: o });
    expect(onLocate).not.toHaveBeenCalled();
  });

  it("double-click calls onLocate with the obstacle feature", () => {
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    const o = obstacle({ id: "o-x" });
    render(
      <ObstaclesPanel
        obstacles={[o]}
        layerConfig={DEFAULT_LAYER_CONFIG}
        onSelect={onSelect}
        onLocate={onLocate}
      />,
    );

    const row = screen.getByTestId("obstacle-item-o-x");
    fireEvent.doubleClick(row);

    expect(onLocate).toHaveBeenCalledWith({ type: "obstacle", data: o });
  });
});
