import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import DroneListPage from "./DroneListPage";

const mockListDroneProfiles = vi.fn();
const mockCreateDroneProfile = vi.fn();
const mockDeleteDroneProfile = vi.fn();

vi.mock("@/api/droneProfiles", () => ({
  listDroneProfiles: (...args: unknown[]) => mockListDroneProfiles(...args),
  createDroneProfile: (...args: unknown[]) => mockCreateDroneProfile(...args),
  deleteDroneProfile: (...args: unknown[]) => mockDeleteDroneProfile(...args),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const DRONE_1 = {
  id: "d-1",
  name: "Matrice 300",
  manufacturer: "DJI",
  model: "M300 RTK",
  max_speed: 23,
  max_climb_rate: 6,
  max_altitude: 5000,
  battery_capacity: 5935,
  endurance_minutes: 55,
  camera_resolution: "20MP",
  camera_frame_rate: 30,
  sensor_fov: 84,
  weight: 6.3,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
  mission_count: 3,
  model_identifier: null,
};

const DRONE_2 = {
  id: "d-2",
  name: "Mavic 3E",
  manufacturer: "DJI",
  model: "Mavic 3 Enterprise",
  max_speed: 21,
  max_climb_rate: 8,
  max_altitude: 6000,
  battery_capacity: 5000,
  endurance_minutes: 45,
  camera_resolution: "20MP",
  camera_frame_rate: 30,
  sensor_fov: 84,
  weight: 0.92,
  created_at: "2025-02-01T00:00:00Z",
  updated_at: "2025-02-10T00:00:00Z",
  mission_count: 1,
  model_identifier: null,
};

const DRONE_3 = {
  id: "d-3",
  name: "EVO II Pro",
  manufacturer: "Autel",
  model: "EVO II",
  max_speed: 20,
  max_climb_rate: 5,
  max_altitude: 7000,
  battery_capacity: 7100,
  endurance_minutes: 42,
  camera_resolution: "48MP",
  camera_frame_rate: 60,
  sensor_fov: 82,
  weight: 1.19,
  created_at: "2025-03-01T00:00:00Z",
  updated_at: "2025-03-05T00:00:00Z",
  mission_count: 0,
  model_identifier: null,
};

function renderPage() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <MemoryRouter>
            <DroneListPage />
          </MemoryRouter>
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("DroneListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockListDroneProfiles.mockResolvedValue({
      data: [DRONE_1, DRONE_2, DRONE_3],
      meta: { total: 3 },
    });
  });

  it("renders spinner while loading", () => {
    mockListDroneProfiles.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("drone-search")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders table with drone rows after data loads", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    expect(screen.getByText("Mavic 3E")).toBeInTheDocument();
    expect(screen.getByText("EVO II Pro")).toBeInTheDocument();
  });

  it("filters drones by search input", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("drone-search"), {
      target: { value: "mavic" },
    });
    expect(screen.queryByText("Matrice 300")).not.toBeInTheDocument();
    expect(screen.getByText("Mavic 3E")).toBeInTheDocument();
  });

  it("filters drones by manufacturer dropdown", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("manufacturer-filter"), {
      target: { value: "Autel" },
    });
    expect(screen.queryByText("Matrice 300")).not.toBeInTheDocument();
    expect(screen.getByText("EVO II Pro")).toBeInTheDocument();
  });

  it("navigates to drone detail on row click", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("drone-row-d-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones/d-1");
  });

  it("opens create dialog and submits", async () => {
    mockCreateDroneProfile.mockResolvedValue({ id: "d-new", name: "New Drone" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-drone-btn"));
    const nameInput = screen.getByTestId("create-drone-name");
    fireEvent.change(nameInput, { target: { value: "New Drone" } });
    fireEvent.submit(nameInput.closest("form")!);
    await waitFor(() => {
      expect(mockCreateDroneProfile).toHaveBeenCalled();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones/d-new");
  });

  it("shows create error when name is empty", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-drone-btn"));
    const form = screen.getByTestId("create-drone-name").closest("form")!;
    fireEvent.submit(form);
    expect(
      screen.getByText("coordinator.drones.create.nameRequired"),
    ).toBeInTheDocument();
  });

  it("calls deleteDroneProfile and closes modal on confirm", async () => {
    mockDeleteDroneProfile.mockResolvedValue({ success: true });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });

    // click inline delete action button
    const row = screen.getByTestId("drone-row-d-1");
    const deleteAction = within(row).getByTitle("coordinator.drones.actions.delete");
    fireEvent.click(deleteAction);

    // confirm delete
    const deleteBtn = screen.getByText("common.delete");
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(mockDeleteDroneProfile).toHaveBeenCalledWith("d-1");
    });
  });

  it("shows error toast when delete fails", async () => {
    mockDeleteDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });

    const row = screen.getByTestId("drone-row-d-1");
    fireEvent.click(within(row).getByTitle("coordinator.drones.actions.delete"));
    fireEvent.click(screen.getByText("common.delete"));
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.delete.deleteError"),
      ).toBeInTheDocument();
    });
  });

  it("shows error toast when duplicate fails", async () => {
    mockCreateDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Matrice 300")).toBeInTheDocument();
    });

    const row = screen.getByTestId("drone-row-d-1");
    fireEvent.click(within(row).getByTitle("coordinator.drones.actions.duplicate"));
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.duplicate.error"),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no drones", async () => {
    mockListDroneProfiles.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.noDrones"),
      ).toBeInTheDocument();
    });
  });

  it("shows load error state with retry", async () => {
    mockListDroneProfiles.mockRejectedValue(new Error("network"));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.loadError"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("common.retry")).toBeInTheDocument();
  });
});
