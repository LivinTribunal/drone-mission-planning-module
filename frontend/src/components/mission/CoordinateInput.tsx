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
    if (raw !== "" && num === null) return;

    const curLat = value ? value.coordinates[1] : 0;
    const curLon = value ? value.coordinates[0] : 0;
    const curAlt = value ? value.coordinates[2] : 0;

    if (raw === "" && field === "lat" && !value) return;
    if (raw === "" && field === "lon" && !value) return;

    let newLat = curLat;
    let newLon = curLon;
    let newAlt = curAlt;

    if (field === "lat") newLat = num ?? 0;
    if (field === "lon") newLon = num ?? 0;
    if (field === "alt") newAlt = num ?? 0;

    // if all empty, set null
    if (raw === "" && field === "lat" && curLon === 0 && curAlt === 0) {
      onChange(null);
      return;
    }

    onChange({
      type: "Point",
      coordinates: [newLon, newLat, newAlt],
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
