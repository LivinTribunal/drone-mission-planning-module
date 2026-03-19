import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAirport } from "@/contexts/AirportContext";
import { useTheme } from "@/contexts/ThemeContext";
import AirportSelector from "@/components/common/AirportSelector";

export interface NavItem {
  label: string;
  to: string;
  disabled?: boolean;
}

interface NavBarProps {
  items: NavItem[];
  role: "operator" | "coordinator";
}

export default function NavBar({ items, role }: NavBarProps) {
  const { user, logout } = useAuth();
  const { selectedAirport } = useAirport();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasCoordinatorRole = user?.roles.includes("COORDINATOR");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav
      className="flex items-center gap-4 px-4 py-4 bg-tv-bg"
      data-testid="navbar"
    >
      {/* left section - 30% */}
      <div className="w-[30%] flex-shrink-0">
        <NavLink
          to={
            role === "operator"
              ? "/operator-center/dashboard"
              : "/coordinator-center/airports"
          }
          className="inline-flex items-center gap-2 rounded-full bg-tv-surface px-4 py-2.5"
        >
          <svg
            className="h-5 w-5 text-tv-accent"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-sm font-semibold text-tv-text-primary">
            TarmacView Mission Control Center
          </span>
        </NavLink>
      </div>

      {/* right section - 70% */}
      <div className="flex-1 flex items-center justify-between">
        {/* nav pills */}
        <div className="flex items-center gap-1 rounded-full bg-tv-surface p-1">
          {items.map((item) => {
            const disabled = item.disabled || !selectedAirport;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={(e) => disabled && e.preventDefault()}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    disabled
                      ? "opacity-50 cursor-not-allowed text-tv-text-muted"
                      : isActive
                        ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                        : "text-tv-text-primary hover:bg-tv-surface-hover"
                  }`
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* airport selector */}
          <AirportSelector />

          {/* user dropdown */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium
                bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              data-testid="user-menu-button"
            >
              {user?.name ?? "User"}
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 min-w-[200px] rounded-2xl border
                  border-tv-border bg-tv-surface p-2 z-50"
                data-testid="user-menu"
              >
                <button
                  className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                    text-tv-text-primary opacity-50 cursor-not-allowed"
                  disabled
                >
                  Settings
                </button>
                <button
                  onClick={toggleTheme}
                  className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                    text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                >
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </button>
                {role === "operator" && hasCoordinatorRole && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/coordinator-center/airports");
                    }}
                    className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                      text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                  >
                    Configurator Center
                  </button>
                )}
                {role === "coordinator" && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/operator-center/dashboard");
                    }}
                    className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                      text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                  >
                    Mission Center
                  </button>
                )}
                <hr className="my-1 border-tv-border" />
                <button
                  onClick={handleLogout}
                  className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                    text-tv-error hover:bg-tv-surface-hover transition-colors"
                  data-testid="logout-button"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
