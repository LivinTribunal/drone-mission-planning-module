import { useTranslation } from "react-i18next";
import type { PointZ } from "@/types/common";

interface CoordinateInputProps {
  label: string;
  value: PointZ | null;
  onChange: (value: PointZ | null) => void;
}

export default function CoordinateInput({
  label,
  value,
  onChange,
}: CoordinateInputProps) {
  const { t } = useTranslation();

  const lat = value ? value.coordinates[1] : "";
  const lon = value ? value.coordinates[0] : "";
  const alt = value ? value.coordinates[2] : "";

  const latNum = typeof lat === "number" ? lat : NaN;
  const lonNum = typeof lon === "number" ? lon : NaN;

  const latError =
    typeof lat === "number" && (lat < -90 || lat > 90)
      ? t("mission.config.latRange")
      : null;
  const lonError =
    typeof lon === "number" && (lon < -180 || lon > 180)
      ? t("mission.config.lonRange")
      : null;

  function handleChange(field: "lat" | "lon" | "alt", raw: string) {
    const num = raw === "" ? null : parseFloat(raw);
    if (raw !== "" && (num === null || isNaN(num as number))) return;

    if (raw === "" && !value) return;

    const curLat = value ? value.coordinates[1] : 0;
    const curLon = value ? value.coordinates[0] : 0;
    const curAlt = value ? value.coordinates[2] : 0;

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
      <label className="block text-xs font-medium mb-1.5 text-tv-text-secondary">
        {label}
      </label>
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
      {!isNaN(latNum) && !isNaN(lonNum) && !latError && !lonError && (
        <p className="mt-1 text-xs text-tv-text-muted">
          {latNum.toFixed(6)}, {lonNum.toFixed(6)}
        </p>
      )}
    </div>
  );
}
