import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

let mockSelectedAirport: { id: string; name: string } | null = null;
const mockClearAirport = vi.fn();
const mockSelectAirport = vi.fn();

vi.mock("@/contexts/AirportContext", () => ({
  useAirport: () => ({
    selectedAirport: mockSelectedAirport,
    airportDetail: null,
    airportDetailLoading: false,
    airportDetailError: false,
    selectAirport: mockSelectAirport,
    clearAirport: mockClearAirport,
    refreshAirportDetail: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("./NavBar", () => ({
  default: () => <nav data-testid="navbar">nav</nav>,
}));

/** render coordinator layout at a given path. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CoordinatorLayout />
    </MemoryRouter>,
  );
}

describe("CoordinatorLayout", () => {
  /** test suite for coordinator layout airport-change navigation. */
  beforeEach(() => {
    mockSelectedAirport = null;
    mockNavigate.mockClear();
    mockClearAirport.mockClear();
  });

  it("clears airport on mount", () => {
    /** verify airport is cleared when layout mounts. */
    renderAt("/coordinator-center/airports");
    expect(mockClearAirport).toHaveBeenCalled();
  });

  it("navigates to airport detail when airport selected on airports list page", () => {
    /** verify selecting airport from list page navigates to its detail. */
    const { rerender } = render(
      <MemoryRouter initialEntries={["/coordinator-center/airports"]}>
        <CoordinatorLayout />
      </MemoryRouter>,
    );

    mockSelectedAirport = { id: "apt-1", name: "Bratislava" };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={["/coordinator-center/airports"]}>
          <CoordinatorLayout />
        </MemoryRouter>,
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/airports/apt-1");
  });

  it("does not navigate away from drones page on airport change", () => {
    /** verify drones page is unaffected by airport changes. */
    mockSelectedAirport = { id: "apt-1", name: "Bratislava" };

    const { rerender } = render(
      <MemoryRouter initialEntries={["/coordinator-center/drones"]}>
        <CoordinatorLayout />
      </MemoryRouter>,
    );

    mockNavigate.mockClear();
    mockSelectedAirport = { id: "apt-2", name: "Kosice" };

    act(() => {
      rerender(
        <MemoryRouter initialEntries={["/coordinator-center/drones"]}>
          <CoordinatorLayout />
        </MemoryRouter>,
      );
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to airports list when airport is cleared on detail page", () => {
    /** verify clearing airport from detail page goes back to list. */
    mockSelectedAirport = { id: "apt-1", name: "Bratislava" };

    const { rerender } = render(
      <MemoryRouter initialEntries={["/coordinator-center/airports/apt-1"]}>
        <CoordinatorLayout />
      </MemoryRouter>,
    );

    mockNavigate.mockClear();
    mockSelectedAirport = null;

    act(() => {
      rerender(
        <MemoryRouter initialEntries={["/coordinator-center/airports/apt-1"]}>
          <CoordinatorLayout />
        </MemoryRouter>,
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/airports");
  });

  it("does not navigate when same airport is re-selected", () => {
    /** verify no navigation happens when selecting the same airport. */
    mockSelectedAirport = { id: "apt-1", name: "Bratislava" };

    const { rerender } = render(
      <MemoryRouter initialEntries={["/coordinator-center/airports/apt-1"]}>
        <CoordinatorLayout />
      </MemoryRouter>,
    );

    mockNavigate.mockClear();

    act(() => {
      rerender(
        <MemoryRouter initialEntries={["/coordinator-center/airports/apt-1"]}>
          <CoordinatorLayout />
        </MemoryRouter>,
      );
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
