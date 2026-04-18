import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import NavBar from "./NavBar";
import type { NavItem } from "./NavBar";

export default function SuperAdminLayout() {
  const { t } = useTranslation();

  const adminItems: NavItem[] = [
    { label: t("nav.missionCenter"), to: "/operator-center/dashboard" },
    { label: t("nav.configuratorCenter"), to: "/coordinator-center/airports" },
    { label: t("nav.users"), to: "/super-admin/users" },
    { label: t("nav.airports"), to: "/super-admin/airports" },
    { label: t("nav.system"), to: "/super-admin/system" },
    { label: t("nav.auditLog"), to: "/super-admin/audit-log" },
  ];

  return (
    <div className="flex flex-col h-screen bg-tv-bg text-tv-text-primary role-admin">
      <NavBar items={adminItems} role="admin" />
      <main className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
