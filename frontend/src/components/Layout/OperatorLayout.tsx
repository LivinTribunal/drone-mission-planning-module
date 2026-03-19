import { Outlet } from "react-router-dom";
import { useAirport } from "@/contexts/AirportContext";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

const operatorItems: NavItem[] = [
  { label: "Dashboard", to: "/operator-center/dashboard" },
  { label: "Missions", to: "/operator-center/missions" },
  { label: "Airport", to: "/operator-center/airport" },
  { label: "Results", to: "#", disabled: true },
];

export default function OperatorLayout() {
  const { selectedAirport } = useAirport();

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <NavBar items={operatorItems} role="operator" />
      <main className="flex-1 overflow-auto">
        {selectedAirport ? (
          <Outlet />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
            <p className="text-lg mb-2">Select an airport to get started</p>
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
