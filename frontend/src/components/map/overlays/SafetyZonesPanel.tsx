import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { SafetyZoneResponse } from "@/types/airport";
import type { MapFeature, MapLayerConfig } from "@/types/map";

interface SafetyZonesPanelProps {
  safetyZones: SafetyZoneResponse[];
  layerConfig: MapLayerConfig;
  onItemClick: (feature: MapFeature) => void;
}

const ZONE_COLORS: Record<string, string> = {
  CTR: "#4595e5",
  RESTRICTED: "#e5a545",
  PROHIBITED: "#e54545",
  TEMPORARY_NO_FLY: "#e5e545",
};

export default function SafetyZonesPanel({
  safetyZones,
  layerConfig,
  onItemClick,
}: SafetyZonesPanelProps) {
  /** collapsible list of safety zones with color-coded indicators. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const count = safetyZones.length;
  const grayed = !layerConfig.safetyZones;

  function handleClick(zone: SafetyZoneResponse) {
    /** trigger feature selection for a safety zone. */
    if (grayed) return;
    onItemClick({ type: "safety_zone", data: zone });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="safety-zones-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("airport.safetyZones")}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold bg-tv-accent text-tv-accent-text"
          >
            {count}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-tv-text-muted transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-tv-border">
          {count === 0 ? (
            <p className="px-3 py-3 text-sm italic text-tv-text-muted text-center">
              {t("airport.noSafetyZones")}
            </p>
          ) : (
            safetyZones.map((zone, idx) => (
              <button
                key={zone.id}
                onClick={() => handleClick(zone)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  grayed
                    ? "opacity-50 pointer-events-none"
                    : "hover:bg-tv-surface-hover cursor-pointer"
                } ${idx < count - 1 ? "border-b border-tv-border" : ""}`}
                data-testid={`zone-item-${zone.id}`}
              >
                {/* colored dot */}
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ZONE_COLORS[zone.type] ?? "#6b6b6b" }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-tv-text-primary truncate">
                      {zone.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
                      style={{
                        borderColor: ZONE_COLORS[zone.type] ?? "#6b6b6b",
                        color: ZONE_COLORS[zone.type] ?? "#6b6b6b",
                      }}
                    >
                      {t(`airport.zoneType.${zone.type}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {zone.altitude_floor != null && zone.altitude_ceiling != null && (
                      <span className="text-[10px] text-tv-text-secondary">
                        {zone.altitude_floor}m — {zone.altitude_ceiling}m
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: zone.is_active ? "var(--tv-success)" : "#6b6b6b" }}
                      />
                      <span className="text-tv-text-muted">
                        {zone.is_active ? t("airport.active") : t("airport.inactive")}
                      </span>
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
