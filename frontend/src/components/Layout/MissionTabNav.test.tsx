import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MissionTabNav from "./MissionTabNav";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const { mockDeleteMission, mockRefreshMissions: hoistedRefresh, mockNavigate: hoistedNavigate } = vi.hoisted(() => ({
  mockDeleteMission: vi.fn(() => Promise.resolve({ deleted: true })),
  mockRefreshMissions: vi.fn(() => Promise.resolve()),
  mockNavigate: vi.fn(),
}));
vi.mock("@/api/missions", () => ({
  updateMission: vi.fn(),
  duplicateMission: vi.fn(() => Promise.resolve({ id: "copy-1" })),
  deleteMission: mockDeleteMission,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => hoistedNavigate,
    useParams: () => ({ id: "mission-1" }),
    useLocation: () => ({ pathname: "/operator-center/missions/mission-1/configuration" }),
  };
});

vi.mock("@/contexts/MissionContext", () => ({
  useMission: () => ({
    missions: [
      { id: "mission-1", name: "Test Mission", status: "DRAFT" },
    ],
    selectedMission: null,
    refreshMissions: hoistedRefresh,
    updateMissionInList: vi.fn(),
  }),
}));

/** render mission tab nav in a memory router. */
function renderComponent() {
  return render(
    <MemoryRouter initialEntries={["/operator-center/missions/mission-1/configuration"]}>
      <MissionTabNav />
    </MemoryRouter>,
  );
}

describe("MissionTabNav delete action", () => {
  /** tests for the delete button and confirmation dialog in mission selector. */
  beforeEach(() => {
    hoistedNavigate.mockClear();
    mockDeleteMission.mockClear();
    hoistedRefresh.mockClear();
  });

  it("renders the delete action button", () => {
    renderComponent();
    const deleteBtn = screen.getByTitle("common.delete");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("opens confirmation modal when delete is clicked", () => {
    renderComponent();
    fireEvent.click(screen.getByTitle("common.delete"));
    expect(screen.getByText("mission.validationExportPage.deleteConfirmMessage")).toBeInTheDocument();
  });

  it("closes modal when cancel is clicked", () => {
    renderComponent();
    fireEvent.click(screen.getByTitle("common.delete"));
    expect(screen.getByText("mission.validationExportPage.deleteConfirmMessage")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("mission.validationExportPage.deleteConfirmMessage")).not.toBeInTheDocument();
    expect(mockDeleteMission).not.toHaveBeenCalled();
  });

  it("calls deleteMission and navigates on confirm", async () => {
    renderComponent();
    fireEvent.click(screen.getByTitle("common.delete"));

    const modal = screen.getByRole("dialog");
    const confirmBtn = modal.querySelector("button.bg-tv-error") as HTMLElement;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteMission).toHaveBeenCalledWith("mission-1");
    });
    await waitFor(() => {
      expect(hoistedNavigate).toHaveBeenCalledWith("/operator-center/missions");
    });
  });
});
