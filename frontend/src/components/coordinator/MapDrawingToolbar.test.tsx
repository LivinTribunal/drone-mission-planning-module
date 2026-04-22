import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapDrawingToolbar from "./MapDrawingToolbar";
import type { DrawingTool } from "@/types/map";

// minimal i18n mock so tests don't need full react-i18next setup
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderToolbar(overrides: Partial<React.ComponentProps<typeof MapDrawingToolbar>> = {}) {
  /** render with safe defaults. */
  const props = {
    activeTool: "select" as DrawingTool,
    onToolChange: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onGeoJsonEditor: vi.fn(),
    zoomPercent: 100,
    onZoomTo: vi.fn(),
    onZoomReset: vi.fn(),
    isDirty: false,
    saving: false,
    onSave: vi.fn(),
    saveLabel: "Save",
    bearing: 0,
    onBearingReset: vi.fn(),
    ...overrides,
  };
  return { ...render(<MapDrawingToolbar {...props} />), props };
}

describe("MapDrawingToolbar", () => {
  it("renders a move button in the interact group", () => {
    renderToolbar();
    expect(screen.getByTestId("tool-move")).toBeInTheDocument();
  });

  it("move button sits between select and pan in the interact group", () => {
    renderToolbar();
    const toolbar = screen.getByTestId("drawing-toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("[data-testid^='tool-']"))
      .map((el) => el.getAttribute("data-testid"));
    const selectIdx = buttons.indexOf("tool-select");
    const moveIdx = buttons.indexOf("tool-move");
    const panIdx = buttons.indexOf("tool-pan");
    expect(selectIdx).toBeGreaterThanOrEqual(0);
    expect(moveIdx).toBe(selectIdx + 1);
    expect(panIdx).toBe(moveIdx + 1);
  });

  it("clicking move dispatches onToolChange(\"move\")", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByTestId("tool-move"));
    expect(props.onToolChange).toHaveBeenCalledWith("move");
  });

  it("move button shows active styling when activeTool is move", () => {
    renderToolbar({ activeTool: "move" });
    const btn = screen.getByTestId("tool-move");
    expect(btn.className).toMatch(/bg-tv-accent/);
  });

  it("move button is inactive when activeTool is select", () => {
    renderToolbar({ activeTool: "select" });
    const btn = screen.getByTestId("tool-move");
    expect(btn.className).not.toMatch(/bg-tv-accent/);
  });
});
