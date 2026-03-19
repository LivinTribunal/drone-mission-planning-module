import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AirportProvider } from "@/contexts/AirportContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import App from "./App";
import LoginPage from "@/pages/LoginPage";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import { Routes, Route } from "react-router-dom";

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
  });

  it("renders login page at /login", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
    expect(screen.getByTestId("login-button")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      { route: "/dashboard" },
    );
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("login stores token and shows authenticated content", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByTestId("email-input"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByTestId("password-input"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByTestId("login-button"));

    await waitFor(() => {
      expect(localStorage.getItem("tarmacview_token")).toBeTruthy();
      expect(localStorage.getItem("tarmacview_user")).toBeTruthy();
    });
  });
});

describe("full app routing", () => {
  beforeEach(() => {
    localStorage.clear();
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
