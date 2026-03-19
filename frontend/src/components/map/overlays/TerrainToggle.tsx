import { useTranslation } from "react-i18next";

interface TerrainToggleProps {
  mode: "map" | "satellite";
  onToggle: (mode: "map" | "satellite") => void;
}

export default function TerrainToggle({ mode, onToggle }: TerrainToggleProps) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute bottom-3 right-3 z-10 flex rounded-full border border-tv-border bg-tv-surface p-0.5"
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
