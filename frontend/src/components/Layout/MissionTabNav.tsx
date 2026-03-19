import { NavLink, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const tabs = [
    { label: t("mission.overview"), path: "overview" },
    { label: t("mission.configuration"), path: "configuration" },
    { label: t("mission.map"), path: "map" },
    { label: t("mission.validationExport"), path: "validation-export" },
  ];

  return (
    <div>
      <div
        className="flex gap-1 px-4 py-2 bg-tv-surface rounded-full mx-4 mt-4 p-1"
        data-testid="mission-tabs"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/operator-center/missions/${id}/${tab.path}`}
            className={({ isActive }) =>
              `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                  : "text-tv-text-secondary hover:bg-tv-surface-hover"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="p-4">
        <Outlet />
      </div>
    </div>
  );
}
