import { useState, useEffect } from "react";
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

  // local string state to allow partial clearing without snapping to "0"
  const [latStr, setLatStr] = useState("");
  const [lonStr, setLonStr] = useState("");
  const [altStr, setAltStr] = useState("");

  // sync local strings when external value changes (e.g. pick-on-map)
  useEffect(() => {
    setLatStr(value ? String(value.coordinates[1]) : "");
    setLonStr(value ? String(value.coordinates[0]) : "");
    setAltStr(value ? String(value.coordinates[2]) : "");
  }, [value]);

  const latNum = latStr === "" ? null : parseFloat(latStr);
  const lonNum = lonStr === "" ? null : parseFloat(lonStr);

  const latError =
    typeof latNum === "number" && !isNaN(latNum) && (latNum < -90 || latNum > 90)
      ? t("mission.config.latRange")
      : null;
  const lonError =
    typeof lonNum === "number" && !isNaN(lonNum) && (lonNum < -180 || lonNum > 180)
      ? t("mission.config.lonRange")
      : null;

  function commitValue(newLatStr: string, newLonStr: string, newAltStr: string) {
    /** parse all three fields and call onChange when all are valid numbers or all empty. */
    const lat = newLatStr === "" ? null : parseFloat(newLatStr);
    const lon = newLonStr === "" ? null : parseFloat(newLonStr);
    const alt = newAltStr === "" ? null : parseFloat(newAltStr);

    if (lat === null && lon === null && alt === null) {
      onChange(null);
      return;
    }

    // only commit when all present fields are valid numbers
    if (
      (lat !== null && isNaN(lat)) ||
      (lon !== null && isNaN(lon)) ||
      (alt !== null && isNaN(alt))
    ) {
      return;
    }

    const curLat = value ? value.coordinates[1] : 0;
    const curLon = value ? value.coordinates[0] : 0;
    const curAlt = value ? value.coordinates[2] : (defaultAltitude ?? 0);

    onChange({
      type: "Point",
      coordinates: [lon ?? curLon, lat ?? curLat, alt ?? curAlt],
    });
  }

  function handleChange(field: "lat" | "lon" | "alt", raw: string) {
    /** update local string state on each keystroke. */
    if (raw !== "" && isNaN(parseFloat(raw))) return;

    const newLatStr = field === "lat" ? raw : latStr;
    const newLonStr = field === "lon" ? raw : lonStr;
    const newAltStr = field === "alt" ? raw : altStr;

    if (field === "lat") setLatStr(raw);
    if (field === "lon") setLonStr(raw);
    if (field === "alt") setAltStr(raw);

    commitValue(newLatStr, newLonStr, newAltStr);
  }

  function handleBlur(field: "lat" | "lon" | "alt") {
    /** commit on blur to handle partial clears. */
    const newLatStr = field === "lat" ? latStr : latStr;
    const newLonStr = field === "lon" ? lonStr : lonStr;
    const newAltStr = field === "alt" ? altStr : altStr;
    commitValue(newLatStr, newLonStr, newAltStr);
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
            value={latStr}
            onChange={(e) => handleChange("lat", e.target.value)}
            onBlur={() => handleBlur("lat")}
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
            value={lonStr}
            onChange={(e) => handleChange("lon", e.target.value)}
            onBlur={() => handleBlur("lon")}
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
            value={altStr}
            onChange={(e) => handleChange("alt", e.target.value)}
            onBlur={() => handleBlur("alt")}
            className="w-full px-3 py-2 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-alt`}
          />
        </div>
      </div>
    </div>
  );
}
