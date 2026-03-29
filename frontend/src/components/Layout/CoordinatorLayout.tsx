import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

export default function CoordinatorLayout() {
  /** coordinator center layout - always renders child routes. */
  const { t } = useTranslation();

  const coordinatorItems: NavItem[] = [
    { label: t("nav.missionCenter"), to: "/coordinator-center/dashboard" },
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
