export const WHITE_BALANCE_OPTIONS = [
  { value: "DAYLIGHT", label: "5600K — Daylight" },
  { value: "CLOUDY", label: "6500K — Cloudy" },
  { value: "TUNGSTEN", label: "3200K — Tungsten" },
  { value: "MANUAL_4000K", label: "4000K — Manual" },
] as const;

export const ISO_OPTIONS = [
  100, 200, 400, 800, 1600, 3200, 6400, 12800,
] as const;

export const SHUTTER_SPEED_OPTIONS = [
  "1/30",
  "1/60",
  "1/125",
  "1/250",
  "1/500",
  "1/1000",
  "1/2000",
  "1/4000",
  "1/8000",
] as const;

export const OPTICAL_ZOOM_MIN = 1;
export const OPTICAL_ZOOM_MAX = 20;

// assumed target frame width used to derive suggested optical zoom
// from slant distance and drone FOV (typical LHA/PAPI bar ~ 10m)
export const DEFAULT_TARGET_WIDTH_M = 10;
