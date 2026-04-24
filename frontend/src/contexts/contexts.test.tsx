/**
 * tests for AuthContext, AirportContext, MissionContext, and ThemeContext.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ReactNode } from "react";
import client from "@/api/client";
import { AuthProvider, useAuth } from "./AuthContext";
import { AirportProvider, useAirport } from "./AirportContext";
import { MissionProvider, useMission } from "./MissionContext";
import { ThemeProvider, useTheme } from "./ThemeContext";

vi.mock("@/api/client", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

vi.mock("@/api/airports", () => ({
  getAirport: vi.fn().mockResolvedValue({
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    surfaces: [],
    obstacles: [],
    safety_zones: [],
  }),
  listAirports: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@/api/missions", () => ({
  getMission: vi.fn(),
  listMissions: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
}));

const MOCK_AIRPORT = {
  id: "apt-1",
  icao_code: "LZIB",
  name: "Bratislava",
  city: null,
  country: null,
  elevation: 133,
  location: { type: "Point" as const, coordinates: [17.21, 48.17, 133] as [number, number, number] },
  default_drone_profile_id: null,
  terrain_source: "FLAT" as const,
  has_dem: false,
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme");
  vi.clearAllMocks();
});

// --- AuthContext ---

describe("AuthContext", () => {
  /**
   * wrapper that provides AuthProvider to hooks under test.
   */
  function wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  it("throws when useAuth is used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider",
    );
  });

  it("starts unauthenticated when refresh cookie fails", async () => {
    vi.mocked(client.post).mockRejectedValueOnce(new Error("no cookie"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it("login stores credentials in state without localStorage", async () => {
    const mockUser = {
      id: "u-1",
      email: "test@example.com",
      name: "Test User",
      role: "OPERATOR",
      airports: [],
    };

    // mount-time refresh fails (no cookie), then login succeeds
    vi.mocked(client.post)
      .mockRejectedValueOnce(new Error("no cookie"))
      .mockResolvedValueOnce({
        data: {
          access_token: "test-access-token",
          user: mockUser,
        },
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@example.com", "password123");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("test@example.com");
    expect(result.current.accessToken).toBe("test-access-token");
    expect(localStorage.getItem("tarmacview_refresh_token")).toBeNull();
  });

  it("logout clears credentials from state", async () => {
    // mount-time refresh fails, then login succeeds, then logout posts
    vi.mocked(client.post)
      .mockRejectedValueOnce(new Error("no cookie"))
      .mockResolvedValueOnce({
        data: {
          access_token: "tok",
          user: {
            id: "u-1",
            email: "test@example.com",
            name: "Test",
            role: "OPERATOR",
            airports: [],
          },
        },
      })
      .mockResolvedValueOnce({});

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@example.com", "pw");
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it("rehydrates session from refresh cookie on mount", async () => {
    vi.mocked(client.post).mockResolvedValueOnce({
      data: { access_token: "refreshed-token" },
    });
    vi.mocked(client.get).mockResolvedValueOnce({
      data: {
        id: "u-1",
        email: "saved@example.com",
        name: "Saved User",
        role: "OPERATOR",
        airports: [],
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("saved@example.com");
    expect(result.current.accessToken).toBe("refreshed-token");
  });

  it("stays logged out when refresh cookie is invalid", async () => {
    vi.mocked(client.post).mockRejectedValueOnce(new Error("expired"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
  });
});

// --- AirportContext ---

describe("AirportContext", () => {
  /**
   * wrapper that provides AirportProvider to hooks under test.
   */
  function wrapper({ children }: { children: ReactNode }) {
    return <AirportProvider>{children}</AirportProvider>;
  }

  it("throws when useAirport is used outside AirportProvider", () => {
    expect(() => renderHook(() => useAirport())).toThrow(
      "useAirport must be used within AirportProvider",
    );
  });

  it("starts with no airport selected", () => {
    const { result } = renderHook(() => useAirport(), { wrapper });
    expect(result.current.selectedAirport).toBeNull();
    expect(result.current.airportDetail).toBeNull();
  });

  it("selectAirport stores airport and fetches detail", async () => {
    const { result } = renderHook(() => useAirport(), { wrapper });

    act(() => {
      result.current.selectAirport(MOCK_AIRPORT);
    });

    expect(result.current.selectedAirport?.id).toBe("apt-1");
    expect(localStorage.getItem("tarmacview_airport")).toBeTruthy();

    const { getAirport } = await import("@/api/airports");
    expect(getAirport).toHaveBeenCalledWith("apt-1");

    await waitFor(() => {
      expect(result.current.airportDetail).not.toBeNull();
    });
  });

  it("clearAirport removes airport from state and localStorage", async () => {
    const { result } = renderHook(() => useAirport(), { wrapper });

    act(() => {
      result.current.selectAirport(MOCK_AIRPORT);
    });

    await waitFor(() => {
      expect(result.current.airportDetail).not.toBeNull();
    });

    act(() => {
      result.current.clearAirport();
    });

    expect(result.current.selectedAirport).toBeNull();
    expect(result.current.airportDetail).toBeNull();
    expect(localStorage.getItem("tarmacview_airport")).toBeNull();
  });

  it("rehydrates valid airport from localStorage on mount", async () => {
    localStorage.setItem("tarmacview_airport", JSON.stringify(MOCK_AIRPORT));

    const { result } = renderHook(() => useAirport(), { wrapper });

    await waitFor(() => {
      expect(result.current.selectedAirport?.icao_code).toBe("LZIB");
    });

    const { getAirport } = await import("@/api/airports");
    expect(getAirport).toHaveBeenCalledWith("apt-1");
  });

  it("clears corrupt localStorage airport data on mount", async () => {
    localStorage.setItem("tarmacview_airport", "not-valid-json}}");

    renderHook(() => useAirport(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_airport")).toBeNull();
    });
  });

  it("clears localStorage when airport shape is invalid", async () => {
    localStorage.setItem(
      "tarmacview_airport",
      JSON.stringify({ id: "apt-1", name: "Partial" }),
    );

    renderHook(() => useAirport(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_airport")).toBeNull();
    });
  });
});

// --- MissionContext (rehydration cross-cuts AirportContext) ---

describe("MissionContext rehydration", () => {
  /**
   * wrapper that mounts AirportProvider + MissionProvider inside a router
   * so the mission provider's useNavigate/useLocation hooks resolve.
   */
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <AirportProvider>
          <MissionProvider>{children}</MissionProvider>
        </AirportProvider>
      </MemoryRouter>
    );
  }

  function useMissionAndAirport() {
    return { mission: useMission(), airport: useAirport() };
  }

  it("rehydrates mission and drives airport when only MISSION_KEY is in storage", async () => {
    localStorage.setItem("tarmacview_mission", "mission-1");
    const { getMission } = await import("@/api/missions");
    vi.mocked(getMission).mockResolvedValueOnce({
      id: "mission-1",
      airport_id: "apt-1",
      name: "Test Mission",
      status: "DRAFT",
      inspections: [],
    } as never);

    const { result } = renderHook(() => useMissionAndAirport(), { wrapper });

    await waitFor(() => {
      expect(result.current.mission.selectedMission?.id).toBe("mission-1");
    });

    const { getAirport } = await import("@/api/airports");
    expect(getAirport).toHaveBeenCalledWith("apt-1");

    await waitFor(() => {
      expect(result.current.airport.selectedAirport?.id).toBe("apt-1");
    });
  });

  it("clears mission when airport is cleared", async () => {
    localStorage.setItem("tarmacview_airport", JSON.stringify(MOCK_AIRPORT));
    localStorage.setItem("tarmacview_mission", "mission-1");
    const { getMission } = await import("@/api/missions");
    vi.mocked(getMission).mockResolvedValueOnce({
      id: "mission-1",
      airport_id: "apt-1",
      name: "Test Mission",
      status: "DRAFT",
      inspections: [],
    } as never);

    const { result } = renderHook(() => useMissionAndAirport(), { wrapper });

    await waitFor(() => {
      expect(result.current.airport.selectedAirport?.id).toBe("apt-1");
      expect(result.current.mission.selectedMission?.id).toBe("mission-1");
    });

    act(() => {
      result.current.airport.clearAirport();
    });

    await waitFor(() => {
      expect(result.current.mission.selectedMission).toBeNull();
    });
    expect(localStorage.getItem("tarmacview_mission")).toBeNull();
  });

  it("drops stale MISSION_KEY when getMission rejects", async () => {
    localStorage.setItem("tarmacview_mission", "missing-mission");
    const { getMission } = await import("@/api/missions");
    vi.mocked(getMission).mockRejectedValueOnce(new Error("404"));

    const { result } = renderHook(() => useMissionAndAirport(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_mission")).toBeNull();
    });
    expect(result.current.mission.selectedMission).toBeNull();
  });
});

// --- ThemeContext ---

describe("ThemeContext", () => {
  /**
   * wrapper that provides ThemeProvider to hooks under test.
   */
  function wrapper({ children }: { children: ReactNode }) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  it("throws when useTheme is used outside ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within ThemeProvider",
    );
  });

  it("defaults to light theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("toggleTheme switches between light and dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");
  });

  it("persists theme to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.getItem("tarmacview_theme")).toBe("dark");
  });

  it("applies dark class on document.documentElement", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("removes dark class when toggling back to light", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    act(() => {
      result.current.toggleTheme();
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("rehydrates dark theme from localStorage", () => {
    localStorage.setItem("tarmacview_theme", "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });
});
