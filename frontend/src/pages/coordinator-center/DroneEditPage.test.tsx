import { describe, it, expect, beforeEach, vi } from "vitest";
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

vi.mock("@/api/droneProfiles", () => ({
  getDroneProfile: (...args: unknown[]) => mockGetDroneProfile(...args),
  listDroneProfiles: (...args: unknown[]) => mockListDroneProfiles(...args),
  createDroneProfile: (...args: unknown[]) => mockCreateDroneProfile(...args),
  updateDroneProfile: (...args: unknown[]) => mockUpdateDroneProfile(...args),
  deleteDroneProfile: (...args: unknown[]) => mockDeleteDroneProfile(...args),
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
    localStorage.clear();
    mockGetDroneProfile.mockResolvedValue(DRONE);
    mockListDroneProfiles.mockResolvedValue({
      data: [DRONE, DRONE_2],
      meta: { total: 2 },
    });
  });

  it("renders drone fields in read-only mode after load", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    expect(
      screen.getByText("coordinator.drones.detail.readOnly"),
    ).toBeInTheDocument();
    // no input fields visible in read-only
    expect(screen.queryByTestId("edit-name")).not.toBeInTheDocument();
  });

  it("toggling edit mode shows input fields", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    expect(screen.getByTestId("edit-name")).toBeInTheDocument();
    expect(
      screen.getByText("coordinator.drones.detail.editing"),
    ).toBeInTheDocument();
  });

  it("shows name-required error when save is clicked with empty name", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    const nameInput = screen.getByTestId("edit-name");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("save-drone"));
    expect(
      screen.getByText("coordinator.drones.create.nameRequired"),
    ).toBeInTheDocument();
    expect(mockUpdateDroneProfile).not.toHaveBeenCalled();
  });

  it("calls updateDroneProfile and shows success toast on valid save", async () => {
    const updatedDrone = { ...DRONE, name: "Matrice 350" };
    mockUpdateDroneProfile.mockResolvedValue(updatedDrone);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Matrice 350" },
    });
    fireEvent.click(screen.getByTestId("save-drone"));
    await waitFor(() => {
      expect(mockUpdateDroneProfile).toHaveBeenCalledWith("d-1", expect.objectContaining({ name: "Matrice 350" }));
    });
    expect(
      screen.getByText("coordinator.drones.detail.saved"),
    ).toBeInTheDocument();
  });

  it("shows save error toast when update fails", async () => {
    mockUpdateDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("save-drone"));
    await waitFor(() => {
      expect(
        screen.getByText("coordinator.drones.detail.saveError"),
      ).toBeInTheDocument();
    });
  });

  it("cancel edit resets form to original values", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    // cancel
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    // back to read-only, original name shows
    expect(
      screen.getByText("coordinator.drones.detail.readOnly"),
    ).toBeInTheDocument();
  });

  it("save button disabled when form unchanged", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    const saveBtn = screen.getByTestId("save-drone");
    expect(saveBtn).toBeDisabled();
  });

  it("drone selector dropdown shows all drones", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("drone-selector"));
    expect(screen.getByText("Mavic 3E")).toBeInTheDocument();
  });

  it("shows unsaved-changes dialog when navigating away with dirty form", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("back-to-list"));
    expect(
      screen.getByText("coordinator.drones.detail.unsavedMessage"),
    ).toBeInTheDocument();
  });

  it("discard + navigate proceeds on confirm", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("back-to-list"));
    fireEvent.click(
      screen.getByText("coordinator.drones.detail.discardChanges"),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones");
  });

  it("keep editing closes unsaved dialog", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-edit-toggle"));
    fireEvent.change(screen.getByTestId("edit-name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("back-to-list"));
    fireEvent.click(
      screen.getByText("coordinator.drones.detail.keepEditing"),
    );
    expect(
      screen.queryByText("coordinator.drones.detail.unsavedMessage"),
    ).not.toBeInTheDocument();
  });

  it("duplicate calls createDroneProfile and navigates to new drone", async () => {
    mockCreateDroneProfile.mockResolvedValue({ id: "d-copy", name: "Matrice 300 (Copy)" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-duplicate"));
    await waitFor(() => {
      expect(mockCreateDroneProfile).toHaveBeenCalled();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/coordinator-center/drones/d-copy");
  });

  it("duplicate shows error toast when API fails", async () => {
    mockCreateDroneProfile.mockRejectedValue(new Error("fail"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-duplicate"));
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
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-delete"));
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
      expect(screen.getByTestId("drone-selector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("detail-delete"));
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
