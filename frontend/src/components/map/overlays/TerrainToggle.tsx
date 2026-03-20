import { useTranslation } from "react-i18next";

interface TerrainToggleProps {
  mode: "map" | "satellite";
  onToggle: (mode: "map" | "satellite") => void;
  inline?: boolean;
}

export default function TerrainToggle({ mode, onToggle, inline }: TerrainToggleProps) {
  const { t } = useTranslation();

  const wrapperClass = inline
    ? "flex rounded-full border border-tv-border bg-tv-surface p-0.5"
    : "absolute bottom-2 right-2 z-10 flex rounded-full border border-tv-border bg-tv-surface p-0.5";

  return (
    <div
      className={wrapperClass}
      data-testid="terrain-toggle"
    >
      <button
        onClick={() => onToggle("map")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          mode === "map"
            ? "bg-tv-accent text-tv-accent-text"
            : "text-tv-text-secondary hover:text-tv-text-primary"
        }`}
      >
        {t("dashboard.mapView")}
      </button>
      <button
        onClick={() => onToggle("satellite")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          mode === "satellite"
            ? "bg-tv-accent text-tv-accent-text"
            : "text-tv-text-secondary hover:text-tv-text-primary"
        }`}
      >
        {t("dashboard.satelliteView")}
      </button>
    </div>
  );
}
