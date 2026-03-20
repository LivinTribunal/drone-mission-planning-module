import { useTranslation } from "react-i18next";

interface TerrainToggleProps {
  mode: "map" | "satellite";
  onToggle: (mode: "map" | "satellite") => void;
  inline?: boolean;
}

export default function TerrainToggle({ mode, onToggle, inline }: TerrainToggleProps) {
  const { t } = useTranslation();

  const wrapperClass = inline
    ? "flex rounded-full border border-tv-border bg-tv-surface p-1"
    : "absolute bottom-2 right-2 z-10 flex rounded-full border border-tv-border bg-tv-surface p-1";

  const btnClass = inline
    ? "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
    : "rounded-full px-3 py-1 text-xs font-medium transition-colors";

  return (
    <div
      className={wrapperClass}
      data-testid="terrain-toggle"
    >
      <button
        onClick={() => onToggle("map")}
        className={`${btnClass} ${
          mode === "map"
            ? "bg-tv-accent text-tv-accent-text"
            : "text-tv-text-secondary hover:text-tv-text-primary"
        }`}
      >
        {t("dashboard.mapView")}
      </button>
      <button
        onClick={() => onToggle("satellite")}
        className={`${btnClass} ${
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
