import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

export default function CoordinatorLayout() {
  const { selectedAirport } = useAirport();
  const { t } = useTranslation();

  const coordinatorItems: NavItem[] = [
    { label: t("nav.missionCenter"), to: "/operator-center/dashboard" },
    { label: t("nav.airports"), to: "/coordinator-center/airports" },
    { label: t("nav.inspections"), to: "/coordinator-center/inspections" },
    { label: t("nav.drones"), to: "/coordinator-center/drones" },
  ];

  return (
    <div className="flex flex-col h-screen bg-tv-bg text-tv-text-primary">
      <NavBar items={coordinatorItems} role="coordinator" />
      <main className="flex-1 overflow-auto">
        {selectedAirport ? (
          <Outlet />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-tv-text-muted">
            <p className="text-lg mb-2">{t("nav.selectAirport")}</p>
            <svg
              className="h-8 w-8 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </div>
        )}
      </main>
    </div>
  );
}
