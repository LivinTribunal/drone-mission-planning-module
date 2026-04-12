import { Color } from "cesium";
import type { ObstacleType, SurfaceType } from "@/types/enums";

// design system colors mapped to cesium color instances

// surfaces
export const RUNWAY_FILL = Color.fromCssColorString("#4a4a4a").withAlpha(0.6);
export const RUNWAY_OUTLINE = Color.fromCssColorString("#6a6a6a");
export const TAXIWAY_FILL = Color.fromCssColorString("#c8a83c").withAlpha(0.4);
export const TAXIWAY_OUTLINE = Color.fromCssColorString("#c8a83c").withAlpha(0.6);

// centerlines
export const RUNWAY_CENTERLINE = Color.fromCssColorString("#ffffff").withAlpha(0.7);
export const TAXIWAY_CENTERLINE = Color.fromCssColorString("#1a1a1a").withAlpha(0.6);

// safety zones by type
export const SAFETY_ZONE_COLORS: Record<string, { fill: Color; outline: Color }> = {
  CTR: {
    fill: Color.fromCssColorString("#4595e5").withAlpha(0.1),
    outline: Color.fromCssColorString("#4595e5").withAlpha(0.5),
  },
  RESTRICTED: {
    fill: Color.fromCssColorString("#e5a545").withAlpha(0.1),
    outline: Color.fromCssColorString("#e5a545").withAlpha(0.5),
  },
  PROHIBITED: {
    fill: Color.fromCssColorString("#e54545").withAlpha(0.1),
    outline: Color.fromCssColorString("#e54545").withAlpha(0.5),
  },
  TEMPORARY_NO_FLY: {
    fill: Color.fromCssColorString("#e5e545").withAlpha(0.1),
    outline: Color.fromCssColorString("#e5e545").withAlpha(0.5),
  },
};

// obstacles - single color (legacy)
export const OBSTACLE_BODY = Color.fromCssColorString("#e54545").withAlpha(0.7);
export const OBSTACLE_BUFFER = Color.fromCssColorString("#e54545").withAlpha(0.1);

// per-type obstacle colors matching 2d layer palette
export const OBSTACLE_TYPE_COLORS: Record<ObstacleType, { fill: Color; outline: Color }> = {
  BUILDING: {
    fill: Color.fromCssColorString("#e54545").withAlpha(0.7),
    outline: Color.fromCssColorString("#e54545"),
  },
  TOWER: {
    fill: Color.fromCssColorString("#9b59b6").withAlpha(0.7),
    outline: Color.fromCssColorString("#9b59b6"),
  },
  ANTENNA: {
    fill: Color.fromCssColorString("#e5a545").withAlpha(0.7),
    outline: Color.fromCssColorString("#e5a545"),
  },
  VEGETATION: {
    fill: Color.fromCssColorString("#3bbb3b").withAlpha(0.7),
    outline: Color.fromCssColorString("#3bbb3b"),
  },
  OTHER: {
    fill: Color.fromCssColorString("#6b6b6b").withAlpha(0.7),
    outline: Color.fromCssColorString("#6b6b6b"),
  },
};

// surface buffer zone colors matching 2d layer palette
export const SURFACE_BUFFER_COLORS: Record<SurfaceType, { fill: Color; outline: Color }> = {
  RUNWAY: {
    fill: Color.fromCssColorString("#3b82f6").withAlpha(0.1),
    outline: Color.fromCssColorString("#3b82f6").withAlpha(0.5),
  },
  TAXIWAY: {
    fill: Color.fromCssColorString("#8b5cf6").withAlpha(0.1),
    outline: Color.fromCssColorString("#8b5cf6").withAlpha(0.5),
  },
};

// agl systems
export const AGL_COLOR = Color.fromCssColorString("#e91e90");

// waypoint inspection colors
export const INSPECTION_COLORS = [
  Color.fromCssColorString("#3bbb3b"),
  Color.fromCssColorString("#4595e5"),
  Color.fromCssColorString("#e5a545"),
  Color.fromCssColorString("#9b59b6"),
  Color.fromCssColorString("#e54545"),
];
export const TRANSIT_COLOR = Color.fromCssColorString("#7eb8e5");
export const MEASUREMENT_COLOR = Color.fromCssColorString("#3bbb3b");

// takeoff / landing
export const TAKEOFF_COLOR = Color.fromCssColorString("#3bbb3b");
export const LANDING_COLOR = Color.fromCssColorString("#e54545");
