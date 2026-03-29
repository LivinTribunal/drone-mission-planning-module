import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AirportTable from "./AirportTable";
import AirportSearchBar from "./AirportSearchBar";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import MapDrawingToolbar from "./MapDrawingToolbar";
import type { AirportSummaryResponse } from "@/types/airport";

const mockAirports: AirportSummaryResponse[] = [
  {
    id: "a1",
    icao_code: "LZIB",
    name: "Bratislava Airport",
    city: "Bratislava",
    country: "Slovakia",
    elevation: 133,
    location: { type: "Point", coordinates: [17.21, 48.17, 133] },
    surfaces_count: 2,
    agls_count: 1,
    missions_count: 3,
  },
  {
    id: "a2",
    icao_code: "LKPR",
    name: "Prague Airport",
    city: "Prague",
    country: "Czech Republic",
    elevation: 380,
    location: { type: "Point", coordinates: [14.26, 50.10, 380] },
    surfaces_count: 3,
    agls_count: 0,
    missions_count: 5,
  },
];

describe("AirportTable", () => {
  it("renders table with airport rows", () => {
    const onClick = vi.fn();
    render(<AirportTable airports={mockAirports} onRowClick={onClick} />);
    expect(screen.getByTestId("airport-table")).toBeInTheDocument();
    expect(screen.getByText("LZIB")).toBeInTheDocument();
    expect(screen.getByText("LKPR")).toBeInTheDocument();
  });

  it("calls onRowClick when row is clicked", () => {
    const onClick = vi.fn();
    render(<AirportTable airports={mockAirports} onRowClick={onClick} />);
    fireEvent.click(screen.getByTestId("airport-row-a1"));
    expect(onClick).toHaveBeenCalledWith("a1");
  });

  it("sorts by column when header is clicked", () => {
    const onClick = vi.fn();
    render(<AirportTable airports={mockAirports} onRowClick={onClick} />);
    // click name header to sort by name
    const nameHeader = screen.getByText("coordinator.airportList.columns.name");
    fireEvent.click(nameHeader);

    const rows = screen.getAllByRole("row");
    // header + 2 data rows
    expect(rows).toHaveLength(3);
  });
});

describe("AirportSearchBar", () => {
  const defaultProps = {
    search: "",
    onSearchChange: vi.fn(),
    country: "",
    onCountryChange: vi.fn(),
    countries: ["Slovakia", "Czech Republic"],
    hasAglFilter: false,
    onHasAglChange: vi.fn(),
    onAddClick: vi.fn(),
  };

  it("renders search input and filters", () => {
    render(<AirportSearchBar {...defaultProps} />);
    expect(screen.getByTestId("airport-search-bar")).toBeInTheDocument();
    expect(screen.getByTestId("airport-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("country-filter")).toBeInTheDocument();
    expect(screen.getByTestId("agl-filter")).toBeInTheDocument();
  });

  it("calls onSearchChange when typing", () => {
    render(<AirportSearchBar {...defaultProps} />);
    fireEvent.change(screen.getByTestId("airport-search-input"), {
      target: { value: "LZIB" },
    });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith("LZIB");
  });

  it("calls onAddClick when add button is clicked", () => {
    render(<AirportSearchBar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("add-airport-button"));
    expect(defaultProps.onAddClick).toHaveBeenCalled();
  });
});

describe("ConfirmDeleteDialog", () => {
  it("renders dialog with name", () => {
    render(
      <ConfirmDeleteDialog
        isOpen={true}
        name="Test Airport"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("modal-overlay")).toBeInTheDocument();
  });

  it("calls onConfirm when delete button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog
        isOpen={true}
        name="Test Airport"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-delete-button"));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("MapDrawingToolbar", () => {
  const defaultProps = {
    activeTool: "select" as const,
    onToolChange: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onGeoJsonEditor: vi.fn(),
  };

  it("renders toolbar with tool buttons", () => {
    render(<MapDrawingToolbar {...defaultProps} />);
    expect(screen.getByTestId("drawing-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("tool-pan")).toBeInTheDocument();
    expect(screen.getByTestId("tool-select")).toBeInTheDocument();
    expect(screen.getByTestId("tool-drawPolygon")).toBeInTheDocument();
  });

  it("calls onToolChange when tool is clicked", () => {
    render(<MapDrawingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("tool-pan"));
    expect(defaultProps.onToolChange).toHaveBeenCalledWith("pan");
  });

  it("disables undo when canUndo is false", () => {
    render(<MapDrawingToolbar {...defaultProps} />);
    expect(screen.getByTestId("tool-undo")).toBeDisabled();
  });

  it("enables undo when canUndo is true", () => {
    render(<MapDrawingToolbar {...defaultProps} canUndo={true} />);
    expect(screen.getByTestId("tool-undo")).not.toBeDisabled();
  });

  it("calls onGeoJsonEditor when geojson tool is clicked", () => {
    render(<MapDrawingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("tool-geoJsonEditor"));
    expect(defaultProps.onGeoJsonEditor).toHaveBeenCalled();
  });
});
