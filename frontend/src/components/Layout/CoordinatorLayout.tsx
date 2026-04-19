import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

export default function CoordinatorLayout() {
  /** coordinator layout - clears airport on mount, navigates on airport selector change. */
  const { t } = useTranslation();
  const { selectedAirport, clearAirport } = useAirport();
  const navigate = useNavigate();
  const location = useLocation();
  const mountedRef = useRef(false);
  const prevAirportIdRef = useRef<string | undefined>(undefined);
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  // clear operator's cached airport on first mount
  useEffect(() => {
    clearAirport();
    mountedRef.current = true;
  }, [clearAirport]);

  // navigate when airport selection changes (only after mount)
  useEffect(() => {
    if (!mountedRef.current) return;

    const prevId = prevAirportIdRef.current;
    const newId = selectedAirport?.id;
    prevAirportIdRef.current = newId;

    // skip if airport didn't actually change
    if (prevId === newId) return;

    const path = pathnameRef.current;

    // airports section
    if (path.startsWith("/coordinator-center/airports")) {
      if (newId) {
        navigate(`/coordinator-center/airports/${newId}`);
      } else {
        navigate("/coordinator-center/airports");
      }
      return;
    }

    // inspections section - redirect detail pages to list on airport change
    if (path.startsWith("/coordinator-center/inspections/")) {
      navigate("/coordinator-center/inspections");
      return;
    }
  }, [selectedAirport?.id, navigate]);

  const coordinatorItems: NavItem[] = [
    { label: t("nav.missionCenter"), to: "/operator-center/dashboard" },
    { label: t("nav.airports"), to: "/coordinator-center/airports" },
    { label: t("nav.inspections"), to: "/coordinator-center/inspections" },
    { label: t("nav.drones"), to: "/coordinator-center/drones" },
  ];

  return (
    <div className="flex flex-col h-screen bg-tv-bg text-tv-text-primary role-coordinator">
      <NavBar items={coordinatorItems} role="coordinator" />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
