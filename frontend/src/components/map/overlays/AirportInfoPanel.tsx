import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PointZ } from "@/types/common";

interface AirportInfoPanelProps {
  airport: {
    name: string;
    icao_code: string;
    city: string | null;
    country: string | null;
    elevation: number;
    location: PointZ;
  };
  className?: string;
}

export default function AirportInfoPanel({
  airport,
  className,
}: AirportInfoPanelProps) {
  /** read-only collapsible airport metadata panel for map overlays. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);

  const [lon, lat] = airport.location.coordinates;

  return (
    <div
      className={className ?? "rounded-2xl border border-tv-border bg-tv-bg"}
      data-testid="airport-info-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
            {t("map.airportInfo.title")}
          </span>
          <span className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold bg-tv-accent text-tv-accent-text">
            {airport.icao_code}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted transition-transform" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-tv-text-muted transition-transform" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border px-3 py-2 space-y-1.5">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {t("map.airportInfo.name")}
            </span>
            <p className="text-xs text-tv-text-primary">{airport.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {t("map.airportInfo.city")}
              </span>
              <p className="text-xs text-tv-text-primary">{airport.city ?? "\u2014"}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {t("map.airportInfo.country")}
              </span>
              <p className="text-xs text-tv-text-primary">{airport.country ?? "\u2014"}</p>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {t("map.airportInfo.elevation")}
            </span>
            <p className="text-xs text-tv-text-primary">{airport.elevation} m</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {t("map.airportInfo.lat")}
              </span>
              <p className="text-xs text-tv-text-primary font-mono">{lat.toFixed(6)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {t("map.airportInfo.lon")}
              </span>
              <p className="text-xs text-tv-text-primary font-mono">{lon.toFixed(6)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
