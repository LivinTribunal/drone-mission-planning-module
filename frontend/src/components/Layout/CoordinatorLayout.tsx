import { Outlet } from "react-router-dom";
import { useAirport } from "@/contexts/AirportContext";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

const coordinatorItems: NavItem[] = [
  { label: "Mission Center", to: "/operator-center/dashboard" },
  { label: "Airports", to: "/coordinator-center/airports" },
  { label: "Inspections", to: "/coordinator-center/inspections" },
  { label: "Drones", to: "/coordinator-center/drones" },
];

export default function CoordinatorLayout() {
  const { selectedAirport } = useAirport();

  return (
    <div className="flex flex-col h-screen bg-tv-bg text-tv-text-primary">
      <NavBar items={coordinatorItems} role="coordinator" />
      <main className="flex-1 overflow-auto">
        {selectedAirport ? (
          <Outlet />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-tv-text-muted">
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
