import { useTranslation } from "react-i18next";
import { MapPin, ChevronDown, Play, Square } from "lucide-react";
import { useState, useMemo } from "react";
import type { WaypointResponse } from "@/types/flightPlan";
import type { PointZ } from "@/types/common";

interface WaypointListPanelProps {
  waypoints: WaypointResponse[];
  selectedId: string | null;
  // single-click: select only, no map recenter
  onSelect: (id: string | null) => void;
  // double-click: select AND recenter the map on the item
  onLocate?: (id: string) => void;
  takeoffCoordinate?: PointZ | null;
  landingCoordinate?: PointZ | null;
  visibleInspectionIds?: Set<string>;
}

const typeColors: Record<string, string> = {
  TAKEOFF: "text-tv-info",
  LANDING: "text-tv-error",
  MEASUREMENT: "text-tv-accent",
  TRANSIT: "text-tv-text-secondary",
  HOVER: "text-tv-warning",
};

interface WaypointGroup {
  key: string;
  type: string;
  waypoints: WaypointResponse[];
  startSeq: number;
  endSeq: number;
}

function buildGroups(sorted: WaypointResponse[]): WaypointGroup[] {
  const groups: WaypointGroup[] = [];
  let i = 0;

  while (i < sorted.length) {
    const wp = sorted[i];
    const type = wp.waypoint_type;

    // takeoff and landing are always individual
    if (type === "TAKEOFF" || type === "LANDING") {
      groups.push({
        key: wp.id,
        type,
        waypoints: [wp],
        startSeq: wp.sequence_order,
        endSeq: wp.sequence_order,
      });
      i++;
      continue;
    }

    // collect consecutive waypoints of the same type
    const groupWps = [wp];
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      if (next.waypoint_type === type) {
        groupWps.push(next);
        j++;
      } else if (
        type === "MEASUREMENT" &&
        next.waypoint_type === "HOVER" &&
        next.camera_action !== "RECORDING_START" &&
        next.camera_action !== "RECORDING_STOP"
      ) {
        // regular hover within measurement sequence belongs to same group
        // video start/stop hovers stay as standalone entries
        groupWps.push(next);
        j++;
      } else {
        break;
      }
    }

    groups.push({
      key: `${type}-${wp.sequence_order}`,
      type,
      waypoints: groupWps,
      startSeq: groupWps[0].sequence_order,
      endSeq: groupWps[groupWps.length - 1].sequence_order,
    });
    i = j;
  }

  return groups;
}

export default function WaypointListPanel({
  waypoints,
  selectedId,
  onSelect,
  onLocate,
  takeoffCoordinate,
  landingCoordinate,
  visibleInspectionIds,
}: WaypointListPanelProps) {
  /** collapsible panel listing waypoints and takeoff/landing markers. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    let filtered = [...waypoints];
    if (visibleInspectionIds) {
      filtered = filtered.filter(
        (wp) => !wp.inspection_id || visibleInspectionIds.has(wp.inspection_id),
      );
    }
    const sorted = filtered.sort(
      (a, b) => a.sequence_order - b.sequence_order,
    );
    return buildGroups(sorted);
  }, [waypoints, visibleInspectionIds]);

  const hasTakeoff = !!takeoffCoordinate;
  const hasLanding = !!landingCoordinate;

  if (waypoints.length === 0 && !hasTakeoff && !hasLanding) return null;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function renderWaypointRow(wp: WaypointResponse) {
    // video start/stop hover waypoints get distinct icons and labels
    const isRecordingStart = wp.waypoint_type === "HOVER" && wp.camera_action === "RECORDING_START";
    const isRecordingStop = wp.waypoint_type === "HOVER" && wp.camera_action === "RECORDING_STOP";

    let icon: React.ReactNode;
    let label: string;
    if (isRecordingStart) {
      icon = <Play className="h-3 w-3 flex-shrink-0 text-tv-success" />;
      label = t("mission.config.captureMode.recordingStart");
    } else if (isRecordingStop) {
      icon = <Square className="h-3 w-3 flex-shrink-0 text-tv-warning" />;
      label = t("mission.config.captureMode.recordingStop");
    } else {
      icon = <MapPin className={`h-3 w-3 flex-shrink-0 ${typeColors[wp.waypoint_type] ?? "text-tv-text-muted"}`} />;
      label = t(`map.waypointTypes.${wp.waypoint_type}`, { defaultValue: wp.waypoint_type.replace(/_/g, " ") });
    }

    return (
      <button
        key={wp.id}
        onClick={() => onSelect(selectedId === wp.id ? null : wp.id)}
        onDoubleClick={() => onLocate?.(wp.id)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-left text-xs transition-colors ${
          selectedId === wp.id
            ? "bg-tv-accent/20 text-tv-accent"
            : "text-tv-text-primary hover:bg-tv-surface-hover"
        }`}
        data-testid={`waypoint-item-${wp.id}`}
      >
        {icon}
        <span className="font-medium w-6">{wp.sequence_order}</span>
        <span className="flex-1 truncate">{label}</span>
      </button>
    );
  }

  const count = waypoints.length || ((hasTakeoff ? 1 : 0) + (hasLanding ? 1 : 0));

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg overflow-hidden flex-shrink-0 min-w-[260px]"
      data-testid="waypoint-list-panel"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-tv-text-primary"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border">
            {t("mission.config.waypoints")}
          </span>
          <span className="rounded-full px-2.5 py-0.5 bg-tv-accent text-tv-accent-text text-xs font-semibold">
            {count}
          </span>
        </div>
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
        <div className="max-h-48 overflow-y-auto border-t border-tv-border px-1 pb-1 pt-1">
          {/* show standalone takeoff/landing when no trajectory waypoints */}
          {waypoints.length === 0 && hasTakeoff && (
            <button
              onClick={() => onSelect(selectedId === "takeoff" ? null : "takeoff")}
              onDoubleClick={() => onLocate?.("takeoff")}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-left text-xs transition-colors ${
                selectedId === "takeoff"
                  ? "bg-tv-accent/20 text-tv-accent"
                  : "text-tv-text-primary hover:bg-tv-surface-hover"
              }`}
              data-testid="waypoint-item-takeoff"
            >
              <MapPin className="h-3 w-3 flex-shrink-0 text-tv-info" />
              <span className="font-medium">{t("dashboard.waypointTakeoff")}</span>
            </button>
          )}
          {waypoints.length === 0 && hasLanding && (
            <button
              onClick={() => onSelect(selectedId === "landing" ? null : "landing")}
              onDoubleClick={() => onLocate?.("landing")}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-left text-xs transition-colors ${
                selectedId === "landing"
                  ? "bg-tv-accent/20 text-tv-accent"
                  : "text-tv-text-primary hover:bg-tv-surface-hover"
              }`}
              data-testid="waypoint-item-landing"
            >
              <MapPin className="h-3 w-3 flex-shrink-0 text-tv-error" />
              <span className="font-medium">{t("dashboard.waypointLanding")}</span>
            </button>
          )}
          {groups.map((group) => {
            // single-waypoint group or always-individual types
            if (group.waypoints.length === 1) {
              return renderWaypointRow(group.waypoints[0]);
            }

            // multi-waypoint collapsible group
            const isExpanded = expandedGroups.has(group.key);

            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-xl text-left text-xs text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                >
                  <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  <MapPin
                    className={`h-3 w-3 flex-shrink-0 ${typeColors[group.type] ?? "text-tv-text-muted"}`}
                  />
                  <span className="font-medium">
                    {group.startSeq}-{group.endSeq}
                  </span>
                  <span className="flex-1 truncate">
                    {t(`map.waypointTypes.${group.type}`, { defaultValue: group.type.replace(/_/g, " ") })} ({group.waypoints.length})
                  </span>
                </button>
                {isExpanded && (
                  <div className="pl-3">
                    {group.waypoints.map((wp) => renderWaypointRow(wp))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
