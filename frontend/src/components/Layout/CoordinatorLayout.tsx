import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

export default function CoordinatorLayout() {
  /** coordinator center layout - clears operator airport on mount, syncs selector to routes. */
  const { t } = useTranslation();
  const { selectedAirport, clearAirport } = useAirport();
  const navigate = useNavigate();
  const location = useLocation();
  const mountedRef = useRef(false);

  // clear operator's cached airport on first mount
  useEffect(() => {
    clearAirport();
    mountedRef.current = true;
  }, [clearAirport]);

  // navigate when airport selection changes (only after mount)
  useEffect(() => {
    if (!mountedRef.current) return;
    const onAirportsSection = location.pathname.startsWith("/coordinator-center/airports");
    if (!onAirportsSection) return;

    if (selectedAirport && location.pathname === "/coordinator-center/airports") {
      navigate(`/coordinator-center/airports/${selectedAirport.id}`);
    } else if (!selectedAirport && location.pathname !== "/coordinator-center/airports") {
      navigate("/coordinator-center/airports");
    }
  }, [selectedAirport, location.pathname, navigate]);

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
        <Outlet />
      </main>
    </div>
  );
}
