import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MissionStatus } from "@/types/enums";
import type { MapLayerConfig } from "@/types/map";

type SwatchType =
  | "rectangle"
  | "runway"
  | "taxiway"
  | "circle"
  | "circle-outline"
  | "circle-border"
  | "triangle"
  | "dashed-hatch"
  | "dashed-rectangle"
  | "tower"
  | "antenna"
  | "tree"
  | "rounded-square-letter"
  | "hover-icon"
  | "line-arrow";

interface LegendItem {
  key: string;
  i18nKey: string;
  swatch: SwatchType;
  color: string;
  size?: "sm" | "md";
  letter?: string;
}

// ground surfaces
const surfaceItems: LegendItem[] = [
  { key: "runway", i18nKey: "dashboard.runways", swatch: "runway", color: "#4a4a4a" },
  { key: "taxiway", i18nKey: "dashboard.taxiways", swatch: "taxiway", color: "#c8a83c" },
];

// safety zones - crosshatched swatches
const zoneItems: LegendItem[] = [
  { key: "ctr", i18nKey: "dashboard.ctr", swatch: "dashed-hatch", color: "#4595e5" },
  { key: "restricted", i18nKey: "dashboard.restricted", swatch: "dashed-hatch", color: "#e5a545" },
  { key: "prohibited", i18nKey: "dashboard.prohibited", swatch: "dashed-hatch", color: "#e54545" },
  { key: "temporaryNoFly", i18nKey: "dashboard.temporaryNoFly", swatch: "dashed-hatch", color: "#e5e545" },
  { key: "airportBoundary", i18nKey: "boundary.airportBoundary", swatch: "dashed-rectangle", color: "#ffffff" },
];

// obstacles - per-type icons matching map symbology
const obstacleItems: LegendItem[] = [
  { key: "building", i18nKey: "dashboard.building", swatch: "triangle", color: "#e54545" },
  { key: "tower", i18nKey: "dashboard.tower", swatch: "tower", color: "#9b59b6" },
  { key: "antenna", i18nKey: "dashboard.antenna", swatch: "antenna", color: "#e5a545" },
  { key: "vegetation", i18nKey: "dashboard.vegetation", swatch: "tree", color: "#3bbb3b" },
  { key: "other", i18nKey: "dashboard.other", swatch: "triangle", color: "#6b6b6b" },
];

// agl systems grouped by type
const papiItems: LegendItem[] = [
  { key: "papi-lha", i18nKey: "dashboard.papiLha", swatch: "circle", color: "#e91e90", size: "sm" },
];

const relItems: LegendItem[] = [
  { key: "rel-lha", i18nKey: "dashboard.relLha", swatch: "circle", color: "#f7b32b", size: "sm" },
];

// flight plan - takeoff/landing only
const takeoffLandingItems: LegendItem[] = [
  { key: "takeoff", i18nKey: "dashboard.waypointTakeoff", swatch: "rounded-square-letter", color: "#4595e5", letter: "T" },
  { key: "landing", i18nKey: "dashboard.waypointLanding", swatch: "rounded-square-letter", color: "#e54545", letter: "L" },
];

// flight plan - all waypoint types
const allWaypointItems: LegendItem[] = [
  { key: "measurement", i18nKey: "dashboard.measurement", swatch: "circle-outline", color: "#3bbb3b" },
  { key: "transit", i18nKey: "dashboard.transit", swatch: "circle-border", color: "#ffffff" },
  { key: "hover", i18nKey: "dashboard.hover", swatch: "hover-icon", color: "#e5a545" },
  { key: "transit-path", i18nKey: "dashboard.transitPath", swatch: "line-arrow", color: "#7eb8e5" },
  ...takeoffLandingItems,
];

const STATUSES_WITH_FULL_WAYPOINTS: MissionStatus[] = [
  "PLANNED",
  "VALIDATED",
  "EXPORTED",
  "COMPLETED",
];

function SectionChevron({ open }: { open: boolean }) {
  /** small chevron indicator for collapsible sections. */
  return (
    <svg
      className={`h-3 w-3 text-tv-text-muted transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** renders a swatch icon based on type. */
function Swatch({ item }: { item: LegendItem }) {
  const s = item.size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  if (item.swatch === "rectangle") {
    return (
      <span
        className={`inline-block ${s} rounded-sm`}
        style={{ backgroundColor: item.color }}
      />
    );
  }

  // runway - gray rectangle with white dashed centerline
  if (item.swatch === "runway") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <rect x="1" y="0" width="8" height="10" rx="1" fill={item.color} />
        <line x1="5" y1="1" x2="5" y2="9" stroke="white" strokeWidth="0.8" strokeDasharray="1.5 1" />
      </svg>
    );
  }

  // taxiway - yellowish rectangle with black dashed centerline (vertical like runway)
  if (item.swatch === "taxiway") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 10 10">
        <rect x="1" y="0" width="8" height="10" rx="1" fill={item.color} />
        <line x1="5" y1="1" x2="5" y2="9" stroke="#1a1a1a" strokeWidth="0.7" strokeDasharray="1.5 1" />
      </svg>
    );
  }

  if (item.swatch === "dashed-rectangle") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <rect
          x="0.5" y="0.5" width="9" height="9" rx="1"
          fill="none"
          stroke={item.color}
          strokeWidth="1.2"
          strokeDasharray="2.5 1.5"
        />
      </svg>
    );
  }

  if (item.swatch === "dashed-hatch") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <rect
          x="0.5" y="0.5" width="9" height="9" rx="1"
          fill={item.color + "20"}
          stroke={item.color}
          strokeWidth="1"
          strokeDasharray="2 1"
        />
        <line x1="0" y1="10" x2="10" y2="0" stroke={item.color} strokeWidth="0.7" opacity="0.5" />
        <line x1="-3" y1="7" x2="7" y2="-3" stroke={item.color} strokeWidth="0.7" opacity="0.5" />
        <line x1="3" y1="13" x2="13" y2="3" stroke={item.color} strokeWidth="0.7" opacity="0.5" />
      </svg>
    );
  }

  if (item.swatch === "triangle") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <polygon points="5,1 9,9 1,9" fill={item.color} />
      </svg>
    );
  }

  if (item.swatch === "tower") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <line x1="3" y1="9" x2="4.5" y2="3.5" stroke={item.color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="7" y1="9" x2="5.5" y2="3.5" stroke={item.color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="6.5" x2="6.5" y2="6.5" stroke={item.color} strokeWidth="0.5" />
        <line x1="4" y1="3.5" x2="6" y2="3.5" stroke={item.color} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="5" y1="3.5" x2="5" y2="1" stroke={item.color} strokeWidth="0.6" strokeLinecap="round" />
        <circle cx="5" cy="1" r="0.5" fill={item.color} />
      </svg>
    );
  }

  if (item.swatch === "antenna") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <line x1="5" y1="9" x2="5" y2="2" stroke={item.color} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="3.5" y1="9" x2="6.5" y2="9" stroke={item.color} strokeWidth="0.7" strokeLinecap="round" />
        <path d="M3.5,4 A2,2 0 0,1 5,2.5" fill="none" stroke={item.color} strokeWidth="0.5" />
        <path d="M6.5,4 A2,2 0 0,0 5,2.5" fill="none" stroke={item.color} strokeWidth="0.5" />
        <path d="M2.5,5 A3.5,3.5 0 0,1 5,2" fill="none" stroke={item.color} strokeWidth="0.5" />
        <path d="M7.5,5 A3.5,3.5 0 0,0 5,2" fill="none" stroke={item.color} strokeWidth="0.5" />
        <circle cx="5" cy="2" r="0.5" fill={item.color} />
      </svg>
    );
  }

  if (item.swatch === "tree") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <rect x="4.2" y="6" width="1.6" height="3" rx="0.3" fill="#8B6914" />
        <polygon points="5,1 7.5,5 2.5,5" fill={item.color} />
        <polygon points="5,2.5 8,6.5 2,6.5" fill={item.color} />
      </svg>
    );
  }

  // rounded square with letter - matches takeoff/landing map icons
  if (item.swatch === "rounded-square-letter") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <rect x="1" y="1" width="8" height="8" rx="2" fill={item.color} stroke="#ffffff" strokeWidth="0.6" />
        <text x="5" y="5.5" textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="5" fontWeight="bold">
          {item.letter}
        </text>
      </svg>
    );
  }

  // hover icon - circle with pause bars
  if (item.swatch === "hover-icon") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" fill={item.color} stroke="#ffffff" strokeWidth="0.5" />
        <rect x="3.5" y="3.2" width="1" height="3.6" rx="0.2" fill="#ffffff" />
        <rect x="5.5" y="3.2" width="1" height="3.6" rx="0.2" fill="#ffffff" />
      </svg>
    );
  }

  // line with chevron arrow - matches transit path direction indicators
  if (item.swatch === "line-arrow") {
    return (
      <svg className={s} viewBox="0 0 10 10">
        <line x1="0" y1="5" x2="10" y2="5" stroke={item.color} strokeWidth="2" />
        <polyline points="5,2.5 8,5 5,7.5" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // circle with white outline - matches measurement waypoints
  if (item.swatch === "circle-outline") {
    return (
      <span
        className={`inline-block ${s} rounded-full`}
        style={{
          backgroundColor: item.color,
          border: "1.5px solid #ffffff",
          boxShadow: "0 0 0 0.5px var(--tv-text-muted)",
        }}
      />
    );
  }

  // white circle with gray border - matches transit waypoints
  if (item.swatch === "circle-border") {
    return (
      <span
        className={`inline-block ${s} rounded-full`}
        style={{
          backgroundColor: item.color,
          border: "1.5px solid #6b6b6b",
        }}
      />
    );
  }

  // circle
  return (
    <span
      className={`inline-block ${s} rounded-full`}
      style={{ backgroundColor: item.color }}
    />
  );
}

interface LegendSectionProps {
  title: string;
  items: LegendItem[];
  defaultOpen?: boolean;
}

function LegendSection({ title, items, defaultOpen = true }: LegendSectionProps) {
  /** collapsible legend section with colored swatches. */
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between mb-1"
      >
        <p className="text-[10px] font-medium uppercase text-tv-text-muted">
          {title}
        </p>
        <SectionChevron open={open} />
      </button>
      {open &&
        items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
          >
            <Swatch item={item} />
            {t(item.i18nKey)}
          </div>
        ))}
    </div>
  );
}

function AglSystemsSection() {
  /** collapsible agl systems section with papi and rel sub-groups. */
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [papiOpen, setPapiOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between mb-1"
      >
        <p className="text-[10px] font-medium uppercase text-tv-text-muted">
          {t("dashboard.aglSystems")}
        </p>
        <SectionChevron open={open} />
      </button>
      {open && (
        <div className="space-y-1">
          {/* papi sub-group */}
          <div>
            <button
              onClick={() => setPapiOpen(!papiOpen)}
              className="flex w-full items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
            >
              <Swatch item={{ key: "papi", i18nKey: "dashboard.papiSystem", swatch: "rectangle", color: "#e91e90" }} />
              <span className="flex-1 text-left">{t("dashboard.papiSystem")}</span>
              <SectionChevron open={papiOpen} />
            </button>
            {papiOpen &&
              papiItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2 py-0.5 pl-4 text-xs text-tv-text-secondary"
                >
                  <Swatch item={item} />
                  {t(item.i18nKey)}
                </div>
              ))}
          </div>

          {/* rel sub-group */}
          <div>
            <button
              onClick={() => setRelOpen(!relOpen)}
              className="flex w-full items-center gap-2 py-0.5 text-xs text-tv-text-secondary"
            >
              <Swatch item={{ key: "rel", i18nKey: "dashboard.relSystem", swatch: "rectangle", color: "#f7b32b" }} />
              <span className="flex-1 text-left">{t("dashboard.relSystem")}</span>
              <SectionChevron open={relOpen} />
            </button>
            {relOpen &&
              relItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2 py-0.5 pl-4 text-xs text-tv-text-secondary"
                >
                  <Swatch item={item} />
                  {t(item.i18nKey)}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LegendPanelProps {
  missionStatus?: MissionStatus;
  hasTakeoff?: boolean;
  hasLanding?: boolean;
  layers?: MapLayerConfig;
  className?: string;
}

export default function LegendPanel({
  missionStatus,
  hasTakeoff,
  hasLanding,
  layers,
  className,
}: LegendPanelProps) {
  /** map legend panel with aviation-chart symbology sections. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const hasFullWaypoints =
    missionStatus !== undefined && STATUSES_WITH_FULL_WAYPOINTS.includes(missionStatus);
  const hasTakeoffLanding = hasTakeoff || hasLanding;

  const showSurfaces = !layers || layers.runways || layers.taxiways;
  const showZones = !layers || layers.safetyZones;
  const showObstacles = !layers || layers.obstacles;
  const showFeatures = !layers || layers.aglSystems;
  const showWaypoints = !layers || layers.trajectory;

  return (
    <div
      className={className ?? "absolute top-3 right-3 z-10 w-44 rounded-2xl border border-tv-border bg-tv-bg"}
      style={className ? undefined : { maxHeight: "calc(100% - 170px)" }}
      data-testid="legend-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">
          {t("dashboard.legend")}
        </span>
        <svg
          className={`ml-2 h-4 w-4 text-tv-text-secondary transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {!collapsed && (
        <div className="border-t border-tv-border px-3 pb-2 pt-1 space-y-2 overflow-y-auto max-h-[40vh]">
          {showSurfaces && (
            <LegendSection
              title={t("dashboard.groundSurfaces")}
              items={surfaceItems}
              defaultOpen={false}
            />
          )}
          {showZones && (
            <LegendSection
              title={t("layers.safetyZonesAndBoundary")}
              items={zoneItems}
              defaultOpen={false}
            />
          )}
          {showObstacles && (
            <LegendSection
              title={t("dashboard.obstacles")}
              items={obstacleItems}
            />
          )}
          {showFeatures && <AglSystemsSection />}
          {showWaypoints && hasFullWaypoints ? (
            <LegendSection
              title={t("dashboard.flightPlan")}
              items={allWaypointItems}
            />
          ) : showWaypoints && hasTakeoffLanding ? (
            <LegendSection
              title={t("dashboard.flightPlan")}
              items={takeoffLandingItems}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
