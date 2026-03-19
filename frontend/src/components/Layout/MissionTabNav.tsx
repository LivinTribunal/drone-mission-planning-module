import { NavLink, Outlet, useParams } from "react-router-dom";

const tabs = [
  { label: "Overview", path: "overview" },
  { label: "Configuration", path: "configuration" },
  { label: "Map", path: "map" },
  { label: "Validation & Export", path: "validation-export" },
];

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <div
        className="flex gap-1 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        data-testid="mission-tabs"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/operator-center/missions/${id}/${tab.path}`}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-active)] text-[var(--color-text)] font-medium"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
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
