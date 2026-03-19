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
      className="flex items-center gap-1 px-4 h-14 border-b
        border-[var(--color-border)] bg-[var(--color-nav-bg)]"
      data-testid="navbar"
    >
      {/* logo */}
      <NavLink
        to={
          role === "operator"
            ? "/operator-center/dashboard"
            : "/coordinator-center/airports"
        }
        className="font-bold text-lg text-[var(--color-accent)] mr-6"
      >
        TarmacView
      </NavLink>

      {/* nav items */}
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const disabled = item.disabled || !selectedAirport;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={(e) => disabled && e.preventDefault()}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  disabled
                    ? "opacity-40 cursor-not-allowed text-[var(--color-text-muted)]"
                    : isActive
                      ? "bg-[var(--color-active)] text-[var(--color-text)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                }`
              }
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* airport selector */}
      <AirportSelector />

      {/* user dropdown */}
      <div ref={menuRef} className="relative ml-3">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-1 rounded px-3 py-1.5 text-sm
            text-[var(--color-text)] hover:bg-[var(--color-hover)]"
          data-testid="user-menu-button"
        >
          {user?.name ?? "User"}
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {userMenuOpen && (
          <div
            className="absolute right-0 top-full mt-1 min-w-[180px] rounded border
              border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50"
            data-testid="user-menu"
          >
            <button
              onClick={toggleTheme}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)]"
            >
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            <button
              className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] opacity-50 cursor-not-allowed"
              disabled
            >
              Settings
            </button>
            {role === "operator" && hasCoordinatorRole && (
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate("/coordinator-center/airports");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)]"
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
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)]"
              >
                Mission Center
              </button>
            )}
            <hr className="border-[var(--color-border)]" />
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-[var(--color-hover)]"
              data-testid="logout-button"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
