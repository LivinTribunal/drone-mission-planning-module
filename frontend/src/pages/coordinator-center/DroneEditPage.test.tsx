import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import DroneEditPage from "./DroneEditPage";

const mockGetDroneProfile = vi.fn();
const mockListDroneProfiles = vi.fn();
const mockCreateDroneProfile = vi.fn();
const mockUpdateDroneProfile = vi.fn();
const mockDeleteDroneProfile = vi.fn();
const mockListMissions = vi.fn();

vi.mock("@/api/droneProfiles", () => ({
  getDroneProfile: (...args: unknown[]) => mockGetDroneProfile(...args),
  listDroneProfiles: (...args: unknown[]) => mockListDroneProfiles(...args),
  createDroneProfile: (...args: unknown[]) => mockCreateDroneProfile(...args),
  updateDroneProfile: (...args: unknown[]) => mockUpdateDroneProfile(...args),
  deleteDroneProfile: (...args: unknown[]) => mockDeleteDroneProfile(...args),
  uploadDroneModel: vi.fn(),
}));

vi.mock("@/api/missions", () => ({
  listMissions: (...args: unknown[]) => mockListMissions(...args),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "d-1" }),
  };
});

const DRONE = {
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
  model_identifier: null,
  max_optical_zoom: null,
  created_at: "2026-03-19T00:00:00Z",
  updated_at: "2026-03-19T00:00:00Z",
  mission_count: 1,
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
  model_identifier: null,
  max_optical_zoom: null,
  created_at: "2026-03-18T00:00:00Z",
  updated_at: "2026-03-18T00:00:00Z",
  mission_count: 0,
};

function renderPage() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <MemoryRouter>
            <DroneEditPage />
          </MemoryRouter>
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("DroneEditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    mockGetDroneProfile.mockResolvedValue(DRONE);
    mockListDroneProfiles.mockResolvedValue({
      data: [DRONE, DRONE_2],
      meta: { total: 2 },
    });
    mockListMissions.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders editable fields after load", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    expect(screen.getByTestId("edit-manufacturer")).toBeInTheDocument();
  });

  it("autosaves after field change", async () => {
    const updated = { ...DRONE, name: "Matrice 350" };
    mockUpdateDroneProfile.mockResolvedValue(updated);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Matrice 350" },
    });
    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(mockUpdateDroneProfile).toHaveBeenCalledWith(
        "d-1",
        expect.objectContaining({ name: "Matrice 350" }),
      );
    });
  });

  it("does not autosave when name is empty", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "" },
    });
    vi.advanceTimersByTime(2000);
    expect(mockUpdateDroneProfile).not.toHaveBeenCalled();
  });

  it("shows save error when autosave fails", async () => {
    mockUpdateDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.detail.saveError"),
      ).toBeInTheDocument();
    });
  });

  it("drone selector dropdown shows all drones", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    // click the selected item trigger to open dropdown
    const names = screen.getAllByText("Matrice 300");
    fireEvent.click(names[0]);
    expect(screen.getByText("Mavic 3E")).toBeInTheDocument();
  });

  it("back-to-list navigates to drone list", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    // the X button in the title bar
    fireEvent.click(screen.getByTitle("coordinator.drones.detail.backToList"));
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones");
  });

  it("duplicate calls createDroneProfile and navigates to new drone", async () => {
    mockCreateDroneProfile.mockResolvedValue({
      id: "d-copy",
      name: "Matrice 300 (Copy)",
      created_at: "2026-03-19T00:00:00Z",
      updated_at: "2026-03-19T00:00:00Z",
      mission_count: 0,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("coordinator.drones.detail.duplicate"));
    await waitFor(() => {
      expect(mockCreateDroneProfile).toHaveBeenCalled();
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      "/coordinator-center/drones/d-copy",
    );
  });

  it("duplicate shows error toast when API fails", async () => {
    mockCreateDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("coordinator.drones.detail.duplicate"));
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.duplicate.error"),
      ).toBeInTheDocument();
    });
  });

  it("delete calls deleteDroneProfile and navigates to list", async () => {
    mockDeleteDroneProfile.mockResolvedValue({ success: true });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("coordinator.drones.detail.delete"));
    fireEvent.click(screen.getByText("common.delete"));
    await waitFor(() => {
      expect(mockDeleteDroneProfile).toHaveBeenCalledWith("d-1");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones");
  });

  it("delete shows error toast when API fails", async () => {
    mockDeleteDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("coordinator.drones.detail.delete"));
    fireEvent.click(screen.getByText("common.delete"));
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.delete.deleteError"),
      ).toBeInTheDocument();
    });
  });

  it("shows load error when fetch fails", async () => {
    mockGetDroneProfile.mockRejectedValue(new Error("network"));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.loadError"),
      ).toBeInTheDocument();
    });
  });
});
