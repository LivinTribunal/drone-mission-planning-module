import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasCoordinatorRole = user?.roles.includes("COORDINATOR");

  const availableLanguages = Object.keys(i18n.options.resources ?? {});

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
      className="flex items-center px-4 py-5 bg-tv-bg"
      data-testid="navbar"
    >
      {/* left section - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-hidden pr-4" style={{ scrollbarGutter: "stable" }}>
          <NavLink
            to={
              role === "operator"
                ? "/operator-center/dashboard"
                : "/coordinator-center/airports"
            }
            className="flex w-full items-center justify-center gap-2 rounded-full bg-tv-surface px-4 h-11"
          >
            <svg
              className="h-6 w-6 text-tv-accent"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-sm font-semibold text-tv-text-primary">
              {t("common.appTitle")}
            </span>
          </NavLink>
        </div>
        <div className="w-2.5 flex-shrink-0" />
      </div>

      {/* right section - 70% */}
      <div className="flex-1 flex items-center gap-4 min-w-0">
        {/* nav pills */}
        <div className="flex flex-1 items-center justify-center gap-1 rounded-full bg-tv-surface p-1 h-11">
          {items.map((item) => {
            const disabled = item.disabled || !selectedAirport;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={(e) => disabled && e.preventDefault()}
                className={({ isActive }) =>
                  `px-5 h-9 rounded-full text-sm font-medium transition-colors flex items-center ${
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

        {/* airport selector */}
        <AirportSelector />

        {/* theme toggle */}
        <div className="flex items-center gap-1 rounded-full bg-tv-surface p-1 h-11">
          <button
            onClick={() => theme !== "light" && toggleTheme()}
            className={`rounded-full p-2 transition-colors ${
              theme === "light"
                ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                : "text-tv-text-secondary hover:bg-tv-surface-hover"
            }`}
            aria-label={t("user.lightMode")}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() => theme !== "dark" && toggleTheme()}
            className={`rounded-full p-2 transition-colors ${
              theme === "dark"
                ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                : "text-tv-text-secondary hover:bg-tv-surface-hover"
            }`}
            aria-label={t("user.darkMode")}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          </button>
        </div>

        {/* user dropdown - w-[140px] matches mission tab timestamp */}
        <div ref={menuRef} className="relative w-[140px]">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-full px-4 h-11 text-sm font-medium
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
                {t("user.settings")}
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
                  {t("nav.configuratorCenter")}
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
                  {t("nav.missionCenter")}
                </button>
              )}

              {/* language selector */}
              <hr className="my-1 border-tv-border" />
              <div className="px-4 py-1.5 text-xs font-medium text-tv-text-muted uppercase tracking-wider">
                {t("user.language")}
              </div>
              {availableLanguages.map((code) => (
                <button
                  key={code}
                  onClick={() => i18n.changeLanguage(code)}
                  className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm
                    text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                >
                  {i18n.language === code && (
                    <svg className="h-4 w-4 text-tv-accent" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {!i18n.language.startsWith(code) && <span className="w-4" />}
                  {t(`languages.${code}`)}
                </button>
              ))}

              <hr className="my-1 border-tv-border" />
              <button
                onClick={handleLogout}
                className="block w-full text-left rounded-xl px-4 py-2.5 text-sm
                  text-tv-error hover:bg-tv-surface-hover transition-colors"
                data-testid="logout-button"
              >
                {t("auth.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
