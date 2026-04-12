import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDroneProfile,
  listDroneProfiles,
} from "@/api/droneProfiles";
import { listMissions } from "@/api/missions";
import { setDefaultDrone } from "@/api/airports";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { MissionResponse } from "@/types/mission";
import { Layers, Clock, Star, ArrowLeftRight, X } from "lucide-react";
import Badge from "@/components/common/Badge";
import Card from "@/components/common/Card";
import DetailSelector from "@/components/common/DetailSelector";
import DetailSelectorItem from "@/components/common/DetailSelectorItem";
import DroneModelViewer from "@/components/drone/DroneModelViewer";
import BulkChangeDroneDialog from "@/components/drone/BulkChangeDroneDialog";
import { getBundledModel } from "@/config/droneModels";
import { useAirport } from "@/contexts/AirportContext";
import type { MissionStatus } from "@/types/enums";

interface FieldDef {
  key: keyof DroneProfileResponse;
  labelKey: string;
  unitKey?: string;
}

const FIELDS: FieldDef[] = [
  { key: "name", labelKey: "name" },
  { key: "manufacturer", labelKey: "manufacturer" },
  { key: "model", labelKey: "model" },
  { key: "max_speed", labelKey: "maxSpeed", unitKey: "ms" },
  { key: "max_climb_rate", labelKey: "maxClimbRate", unitKey: "ms" },
  { key: "max_altitude", labelKey: "maxAltitude", unitKey: "m" },
  { key: "battery_capacity", labelKey: "batteryCapacity", unitKey: "mah" },
  { key: "endurance_minutes", labelKey: "endurance", unitKey: "min" },
  { key: "camera_resolution", labelKey: "cameraResolution" },
  { key: "camera_frame_rate", labelKey: "cameraFrameRate", unitKey: "fps" },
  { key: "sensor_fov", labelKey: "sensorFov", unitKey: "degrees" },
  { key: "weight", labelKey: "weight", unitKey: "kg" },
];

/** format an iso date string for display. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** format seconds as m:ss duration string. */
function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** chevron icon that rotates when expanded. */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
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

/** star icon that renders filled when active. */
function FilledStar({ className }: { className?: string }) {
  return <Star className={className} fill="currentColor" />;
}

/** read-only operator drone detail page. */
export default function OperatorDroneDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { selectedAirport, refreshAirportDetail } = useAirport();

  const [drone, setDrone] = useState<DroneProfileResponse | null>(null);
  const [allDrones, setAllDrones] = useState<DroneProfileResponse[]>([]);
  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [notification, setNotification] = useState("");
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // drone selector
  const [showSelector, setShowSelector] = useState(false);
  const [droneSearch, setDroneSearch] = useState("");

  // collapsible mission list
  const [missionsExpanded, setMissionsExpanded] = useState(true);

  // bulk change dialog
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const filteredDrones = droneSearch
    ? allDrones.filter((d) =>
        d.name.toLowerCase().includes(droneSearch.toLowerCase()),
      )
    : allDrones;

  const totalDuration = missions.reduce(
    (sum, m) => sum + (m.estimated_duration ?? 0),
    0,
  );

  const defaultDroneId = selectedAirport?.default_drone_profile_id;
  const isDefault = defaultDroneId === id;

  /** fetch drone profile, all drones, and missions using this drone. */
  const fetchDrone = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    Promise.all([
      getDroneProfile(id),
      listDroneProfiles({ limit: 200 }),
      listMissions({ drone_profile_id: id, airport_id: selectedAirport?.id, limit: 200 }),
    ])
      .then(([droneData, listData, missionsData]) => {
        setDrone(droneData);
        setAllDrones(listData.data);
        setMissions(missionsData.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, selectedAirport?.id]);

  useEffect(() => {
    fetchDrone();
  }, [fetchDrone]);

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  /** show a temporary toast notification. */
  function showToast(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(""), 3000);
  }

  /** navigate to a different drone profile. */
  function handleSelectDrone(droneId: string) {
    setShowSelector(false);
    setDroneSearch("");
    if (droneId === id) return;
    navigate(`/operator-center/drones/${droneId}`);
  }

  /** toggle the drone selector dropdown. */
  function handleSelectorToggle() {
    setShowSelector((prev) => {
      if (prev) setDroneSearch("");
      return !prev;
    });
  }

  /** toggle default drone for this airport. */
  async function handleToggleDefault() {
    if (!selectedAirport || !id) return;
    try {
      await setDefaultDrone(selectedAirport.id, isDefault ? null : id);
      await refreshAirportDetail();
      showToast(
        isDefault
          ? t("operatorDrones.removeDefault")
          : t("operatorDrones.defaultBadge"),
      );
    } catch (err) {
      console.error(
        "toggle default failed:",
        err instanceof Error ? err.message : String(err),
      );
      showToast(t("common.error"));
    }
  }

  /** resolve model identifier to a loadable url. */
  function resolveModelUrl(identifier: string | null): string | null {
    if (!identifier) return null;
    const bundled = getBundledModel(identifier);
    if (bundled) return bundled.path;
    return `/static/models/custom/${identifier}`;
  }

  /** handle bulk change success. */
  function handleBulkSuccess(updatedCount: number, regressedCount: number) {
    if (updatedCount === 0) {
      showToast(t("operatorDrones.noMissions"));
    } else {
      let msg = t("operatorDrones.bulkChangeSuccess", { count: updatedCount });
      if (regressedCount > 0) {
        msg += ` (${t("operatorDrones.bulkRegressed", { count: regressedCount })})`;
      }
      showToast(msg);
    }
    fetchDrone();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <svg
          className="h-6 w-6 animate-spin text-tv-text-muted"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (error || !drone) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <p className="text-sm text-tv-error">
          {t("coordinator.drones.loadError")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full px-4 bg-tv-bg">
      {/* left panel - 30% matching navbar app title width */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div
          className="flex-1 flex flex-col gap-4 min-h-0 pb-4"
          style={{ scrollbarGutter: "stable" }}
        >
          {/* drone selector */}
          <DetailSelector
            title={t("operatorDrones.title")}
            count={allDrones.length}
            actions={[
              {
                icon: isDefault ? FilledStar : Star,
                onClick: handleToggleDefault,
                title: isDefault
                  ? t("operatorDrones.removeDefault")
                  : t("operatorDrones.setDefault"),
                variant: isDefault ? "accent" : "default",
              },
              {
                icon: ArrowLeftRight,
                onClick: () => setShowBulkDialog(true),
                title: t("operatorDrones.bulkChange"),
              },
              {
                icon: X,
                onClick: () => navigate("/operator-center/drones"),
                title: t("coordinator.drones.detail.backToList"),
              },
            ]}
            renderSelected={() => (
              <>
                <span className="flex-1 text-tv-text-primary truncate font-medium">
                  {drone.name}
                </span>
                {isDefault && (
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]">
                    {t("operatorDrones.defaultBadge")}
                  </span>
                )}
                {missions.length > 0 && (
                  <span className="flex items-center gap-0.5 text-tv-text-secondary">
                    <Layers className="h-3 w-3" />
                    <span className="text-xs font-medium">
                      {missions.length}
                    </span>
                  </span>
                )}
              </>
            )}
            isOpen={showSelector}
            onToggle={handleSelectorToggle}
            searchValue={droneSearch}
            onSearchChange={setDroneSearch}
            searchPlaceholder={t("coordinator.drones.searchPlaceholder")}
            noResultsText={t("coordinator.drones.noMatch")}
            renderDropdownItems={() =>
              filteredDrones.length === 0
                ? null
                : filteredDrones.map((d) => {
                    const isSelected = d.id === id;
                    const isDroneDefault =
                      defaultDroneId === d.id;
                    return (
                      <DetailSelectorItem
                        key={d.id}
                        isSelected={isSelected}
                        onClick={() => {
                          handleSelectDrone(d.id);
                          handleSelectorToggle();
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-sm">
                            {d.name}
                            {isDroneDefault && (
                              <span className="ml-1.5 text-xs text-tv-accent font-normal">
                                ({t("operatorDrones.defaultBadge")})
                              </span>
                            )}
                          </span>
                        </div>
                        <div
                          className={`flex items-center gap-3 text-xs mt-0.5 ${isSelected ? "text-tv-accent-text/70" : "text-tv-text-muted"}`}
                        >
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {isSelected
                              ? missions.length
                              : d.mission_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {isSelected && totalDuration > 0
                              ? formatDuration(totalDuration)
                              : "\u2014"}
                          </span>
                          <span className="ml-auto">
                            {formatDate(d.updated_at)}
                          </span>
                        </div>
                      </DetailSelectorItem>
                    );
                  })
            }
          />

          {/* missions panel */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl flex flex-col min-h-0">
            <button
              onClick={() => setMissionsExpanded(!missionsExpanded)}
              className="flex items-center justify-between w-full px-4 py-3 flex-shrink-0"
              data-testid="missions-panel-toggle"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-tv-bg px-3 py-1 text-xs font-medium text-tv-text-secondary uppercase tracking-wider">
                  {t("operatorDrones.missionsUsing")}
                </span>
                <span className="rounded-full bg-tv-accent text-tv-accent-text px-2 py-0.5 text-xs font-semibold">
                  {missions.length}
                </span>
              </div>
              <ChevronIcon expanded={missionsExpanded} />
            </button>

            {missionsExpanded && (
              <div className="px-4 pb-3 overflow-y-auto min-h-0">
                {missions.length === 0 ? (
                  <p className="text-sm text-tv-text-muted italic py-2">
                    {t("operatorDrones.noMissionsForDrone")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
                    {missions.map((m) => (
                      <div
                        key={m.id}
                        onClick={() =>
                          navigate(
                            `/operator-center/missions/${m.id}/overview`,
                          )
                        }
                        className="flex items-center justify-between rounded-xl px-3 py-2 bg-tv-bg
                          hover:bg-tv-surface-hover cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-tv-text-primary truncate">
                            {m.name}
                          </span>
                          <span className="block text-xs text-tv-text-muted">
                            {t("operatorDrones.lastSaved", {
                              date: formatDate(m.updated_at),
                            })}
                          </span>
                        </div>
                        <Badge
                          status={m.status as MissionStatus}
                          className="flex-shrink-0 ml-2"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* right section */}
      <div
        className="flex-1 min-w-0 overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="flex gap-4">
          {/* center panel - drone specs (read-only) */}
          <div className="flex-1 min-w-0">
            <Card className="p-6">
              <h2 className="text-base font-semibold text-tv-text-primary mb-6">
                {drone.name}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {FIELDS.map((field) => {
                  const label = t(
                    `coordinator.drones.fields.${field.labelKey}`,
                  );
                  const unitLabel = field.unitKey
                    ? t(`coordinator.drones.units.${field.unitKey}`)
                    : "";
                  const val = drone[field.key];
                  const displayValue =
                    val != null && val !== "" ? String(val) : "\u2014";

                  return (
                    <div key={field.key}>
                      <span className="block text-xs text-tv-text-secondary mb-1">
                        {unitLabel ? `${label} (${unitLabel})` : label}
                      </span>
                      <span className="block text-sm text-tv-text-primary">
                        {displayValue}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 text-xs text-tv-text-muted italic">
                {t("operatorDrones.contactCoordinator")}
              </p>
            </Card>
          </div>

          {/* right panel - 3d model viewer */}
          <div
            className="relative flex-shrink-0 rounded-2xl border border-[var(--tv-border)] bg-[var(--tv-surface)] overflow-hidden"
            style={{ width: "calc(280px + 16px + 76px + 16px + 140px)" }}
            data-testid="model-viewer-section"
          >
            <DroneModelViewer
              modelUrl={resolveModelUrl(drone.model_identifier)}
            />
          </div>
        </div>
      </div>

      {/* bulk change dialog */}
      {drone && selectedAirport && (
        <BulkChangeDroneDialog
          isOpen={showBulkDialog}
          onClose={() => setShowBulkDialog(false)}
          airportId={selectedAirport.id}
          currentDroneId={drone.id}
          currentDroneName={drone.name}
          allDrones={allDrones}
          onSuccess={handleBulkSuccess}
        />
      )}

      {/* toast notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-tv-border bg-tv-surface px-4 py-3 text-sm text-tv-text-primary">
          {notification}
        </div>
      )}
    </div>
  );
}
