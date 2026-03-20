import { useTranslation } from "react-i18next";
import { MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { WaypointResponse } from "@/types/flightPlan";

interface WaypointListPanelProps {
  waypoints: WaypointResponse[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const typeColors: Record<string, string> = {
  TAKEOFF: "text-tv-info",
  LANDING: "text-tv-error",
  MEASUREMENT: "text-tv-accent",
  TRANSIT: "text-tv-text-secondary",
  HOVER: "text-tv-warning",
};

export default function WaypointListPanel({
  waypoints,
  selectedId,
  onSelect,
}: WaypointListPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort(
    (a, b) => a.sequence_order - b.sequence_order,
  );

  return (
    <div
      className="bg-tv-surface/95 backdrop-blur-sm border border-tv-border rounded-2xl overflow-hidden"
      data-testid="waypoint-list-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-semibold text-tv-text-primary"
      >
        <span>
          {t("mission.config.waypoints")} ({waypoints.length})
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {!collapsed && (
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {sorted.map((wp) => (
            <button
              key={wp.id}
              onClick={() => onSelect(selectedId === wp.id ? null : wp.id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-left text-xs transition-colors ${
                selectedId === wp.id
                  ? "bg-tv-accent/20 text-tv-accent"
                  : "text-tv-text-primary hover:bg-tv-surface-hover"
              }`}
              data-testid={`waypoint-item-${wp.id}`}
            >
              <MapPin
                className={`h-3 w-3 flex-shrink-0 ${typeColors[wp.waypoint_type] ?? "text-tv-text-muted"}`}
              />
              <span className="font-medium w-6">{wp.sequence_order}</span>
              <span className="flex-1 truncate">
                {wp.waypoint_type.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
