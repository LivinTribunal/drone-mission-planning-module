import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";
import { MissionProvider } from "@/contexts/MissionContext";
import { ComputationProvider } from "@/contexts/ComputationContext";
import ComputationNotification from "@/components/common/ComputationNotification";

export default function OperatorLayout() {
  const { t } = useTranslation();

  const operatorItems: NavItem[] = [
    { label: t("nav.dashboard"), to: "/operator-center/dashboard" },
    { label: t("nav.missions"), to: "/operator-center/missions" },
    { label: t("nav.airport"), to: "/operator-center/airport" },
    { label: t("nav.drones"), to: "/operator-center/drones" },
    { label: t("nav.results"), to: "#", disabled: true },
  ];

  return (
    <div className="flex flex-col h-screen bg-tv-bg text-tv-text-primary">
      <NavBar items={operatorItems} role="operator" />
      <main className="flex-1 min-h-0 overflow-auto">
        <MissionProvider>
          <ComputationProvider>
            <Outlet />
            <ComputationNotification />
          </ComputationProvider>
        </MissionProvider>
      </main>
    </div>
  );
}
