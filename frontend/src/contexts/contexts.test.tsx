/**
 * tests for AuthContext, AirportContext, and ThemeContext.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AirportProvider, useAirport } from "./AirportContext";
import { ThemeProvider, useTheme } from "./ThemeContext";

vi.mock("@/api/client", () => ({
  setOnUnauthorized: vi.fn(),
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

const MOCK_AIRPORT = {
  id: "apt-1",
  icao_code: "LZIB",
  name: "Bratislava",
  city: null,
  country: null,
  elevation: 133,
  location: { type: "Point" as const, coordinates: [17.21, 48.17, 133] as [number, number, number] },
  terrain_source: "FLAT",
  dem_file_path: null,
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

  it("starts unauthenticated", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("login stores credentials in state and localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("test@example.com", "password123");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("test@example.com");
    expect(result.current.token).toBeTruthy();
    expect(localStorage.getItem("tarmacview_token")).toBeTruthy();
    expect(localStorage.getItem("tarmacview_user")).toBeTruthy();
  });

  it("logout clears credentials from state and localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("test@example.com", "pw");
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("tarmacview_token")).toBeNull();
    expect(localStorage.getItem("tarmacview_user")).toBeNull();
  });

  it("rehydrates valid user from localStorage on mount", async () => {
    const storedUser = {
      id: "u-1",
      email: "saved@example.com",
      name: "Saved User",
      roles: ["OPERATOR"],
    };
    localStorage.setItem("tarmacview_token", "saved-token");
    localStorage.setItem("tarmacview_user", JSON.stringify(storedUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(result.current.user?.email).toBe("saved@example.com");
    expect(result.current.token).toBe("saved-token");
  });

  it("clears corrupt localStorage data on mount", async () => {
    localStorage.setItem("tarmacview_token", "bad-token");
    localStorage.setItem("tarmacview_user", "not-json{{{");

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_token")).toBeNull();
      expect(localStorage.getItem("tarmacview_user")).toBeNull();
    });
  });

  it("clears localStorage when user shape is invalid", async () => {
    localStorage.setItem("tarmacview_token", "token");
    localStorage.setItem(
      "tarmacview_user",
      JSON.stringify({ id: "u-1", email: "a@b.com" }),
    );

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_token")).toBeNull();
      expect(localStorage.getItem("tarmacview_user")).toBeNull();
    });
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
