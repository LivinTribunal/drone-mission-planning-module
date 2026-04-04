import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import type { PointZ } from "@/types/common";

interface CoordinateInputProps {
  label: string;
  value: PointZ | null;
  onChange: (value: PointZ | null) => void;
  picking?: boolean;
  onPickOnMap?: () => void;
  defaultAltitude?: number;
}

export default function CoordinateInput({
  label,
  value,
  onChange,
  picking,
  onPickOnMap,
  defaultAltitude,
}: CoordinateInputProps) {
  /** lat/lon/alt input group with optional pick-on-map button. */
  const { t } = useTranslation();

  const lat = value ? value.coordinates[1] : "";
  const lon = value ? value.coordinates[0] : "";
  const alt = value ? value.coordinates[2] : "";

  const latError =
    typeof lat === "number" && (lat < -90 || lat > 90)
      ? t("mission.config.latRange")
      : null;
  const lonError =
    typeof lon === "number" && (lon < -180 || lon > 180)
      ? t("mission.config.lonRange")
      : null;

  function handleChange(field: "lat" | "lon" | "alt", raw: string) {
    /** update a single coordinate field. */
    const num = raw === "" ? null : parseFloat(raw);
    if (raw !== "" && (num === null || isNaN(num as number))) return;

    if (raw === "" && !value) return;

    const curLat = value ? value.coordinates[1] : 0;
    const curLon = value ? value.coordinates[0] : 0;
    const curAlt = value ? value.coordinates[2] : (defaultAltitude ?? 0);

    const newLat = field === "lat" ? num : curLat;
    const newLon = field === "lon" ? num : curLon;
    const newAlt = field === "alt" ? num : curAlt;

    // if all fields are cleared, set null
    if (newLat === null && newLon === null && newAlt === null) {
      onChange(null);
      return;
    }

    onChange({
      type: "Point",
      coordinates: [newLon ?? 0, newLat ?? 0, newAlt ?? 0],
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-tv-text-secondary">
          {label}
        </label>
        {onPickOnMap && (
          <button
            type="button"
            onClick={onPickOnMap}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              picking
                ? "border-tv-accent bg-tv-accent text-tv-accent-text"
                : "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
            }`}
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-pick-map`}
          >
            <MapPin className="h-3 w-3" />
            {t("mission.config.pickOnMap")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <input
            type="number"
            step="any"
            placeholder={t("mission.config.latitude")}
            value={lat}
            onChange={(e) => handleChange("lat", e.target.value)}
            className={`w-full px-3 py-2 rounded-full text-sm border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors ${
              latError ? "border-tv-error" : "border-tv-border"
            }`}
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-lat`}
          />
          {latError && (
            <p className="mt-0.5 text-xs text-tv-error">{latError}</p>
          )}
        </div>
        <div>
          <input
            type="number"
            step="any"
            placeholder={t("mission.config.longitude")}
            value={lon}
            onChange={(e) => handleChange("lon", e.target.value)}
            className={`w-full px-3 py-2 rounded-full text-sm border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors ${
              lonError ? "border-tv-error" : "border-tv-border"
            }`}
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-lon`}
          />
          {lonError && (
            <p className="mt-0.5 text-xs text-tv-error">{lonError}</p>
          )}
        </div>
        <div>
          <input
            type="number"
            step="any"
            placeholder={t("mission.config.altitude")}
            value={alt}
            onChange={(e) => handleChange("alt", e.target.value)}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-alt`}
          />
        </div>
      </div>
    </div>
  );
}
