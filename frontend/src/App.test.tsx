import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import App from "./App";
import LoginPage from "@/pages/LoginPage";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import { Routes, Route } from "react-router-dom";

vi.mock("@/api/client", () => ({
  default: {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setOnUnauthorized: vi.fn(),
  setGetAccessToken: vi.fn(),
  setSetNewAccessToken: vi.fn(),
}));

vi.mock("@/api/airports", () => ({
  listAirports: vi.fn().mockResolvedValue({ data: [] }),
  getAirport: vi.fn().mockResolvedValue({
    id: "apt-1",
    icao_code: "LZIB",
    name: "Bratislava",
    surfaces: [],
    obstacles: [],
    safety_zones: [],
  }),
}));

function renderWithProviders(ui: React.ReactElement, { route = "/" } = {}) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders login page at /login", async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId("email-input")).toBeInTheDocument();
    });
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
    expect(screen.getByTestId("login-button")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", async () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      { route: "/dashboard" },
    );

    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
  });

  it("login stores refresh token in localStorage", async () => {
    const mockResponse = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      user: {
        id: "u-1",
        email: "test@example.com",
        name: "Test",
        role: "OPERATOR",
        assigned_airport_ids: [],
        is_active: true,
        created_at: "2026-01-01T00:00:00",
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    renderWithProviders(<LoginPage />, { route: "/login" });

    await waitFor(() => {
      expect(screen.getByTestId("email-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("email-input"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByTestId("password-input"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByTestId("login-button"));

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_refresh_token")).toBe("test-refresh");
    });
  });
});

describe("full app routing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("smoke test - app renders without crashing", () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <AirportProvider>
            <App />
          </AirportProvider>
        </AuthProvider>
      </ThemeProvider>,
    );
    expect(document.body).toBeTruthy();
  });
});
