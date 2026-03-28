import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  Clock,
  FileText,
  CheckCircle,
  TrendingUp,
  Battery,
} from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { listAirportSummaries } from "@/api/airports";
import { listMissions } from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";
import type { AirportSummaryResponse } from "@/types/airport";
import type { MissionResponse } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import CollapsibleSection from "@/components/common/CollapsibleSection";
import Badge from "@/components/common/Badge";
import Button from "@/components/common/Button";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import CreateMissionDialog from "@/components/mission/CreateMissionDialog";

type SortKey =
  | "icao_code"
  | "name"
  | "city"
  | "country"
  | "surfaces_count"
  | "agls_count"
  | "missions_count";

type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 20, 50, 200] as const;

/** build page indices with ellipsis when there are many pages. */
function paginationRange(total: number, current: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | "...")[] = [0];
  const start = Math.max(1, current - 1);
  const end = Math.min(total - 2, current + 1);
  if (start > 1) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push("...");
  pages.push(total - 1);
  return pages;
}

function SortIndicator({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return null;
  return (
    <span className="ml-1 text-tv-accent">
      {dir === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

function AirportSelectionView() {
  const { selectAirport } = useAirport();
  const { t } = useTranslation();
  const [airports, setAirports] = useState<AirportSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("icao_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  const columns: { key: SortKey; label: string }[] = [
    { key: "icao_code", label: t("airportSelection.columns.icaoCode") },
    { key: "name", label: t("airportSelection.columns.name") },
    { key: "city", label: t("airportSelection.columns.city") },
    { key: "country", label: t("airportSelection.columns.country") },
    { key: "surfaces_count", label: t("airportSelection.columns.runways") },
    { key: "agls_count", label: t("airportSelection.columns.aglSystems") },
    { key: "missions_count", label: t("airportSelection.columns.missions") },
  ];

  const fetchAirports = useCallback(() => {
    setLoading(true);
    setError(false);
    listAirportSummaries()
      .then((res) => setAirports(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return airports.filter(
      (a) =>
        a.icao_code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.city ?? "").toLowerCase().includes(q),
    );
  }, [airports, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const showFrom = sorted.length === 0 ? 0 : page * pageSize + 1;
  const showTo = Math.min((page + 1) * pageSize, sorted.length);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setPage(0);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(0);
  }

  return (
    <div className="flex flex-col items-center px-4 py-12">
      <div className="flex items-center gap-3 w-full max-w-5xl mb-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-tv-accent flex-shrink-0">
          <svg className="h-5 w-5 text-tv-accent-text" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder={t("airportSelection.searchPlaceholder")}
          className="flex-1 rounded-full border border-tv-border bg-tv-surface px-5 py-2.5
            text-sm text-tv-text-primary placeholder:text-tv-text-muted
            focus:outline-none focus:border-tv-accent"
        />
      </div>

      <div className="w-full max-w-5xl rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
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
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-tv-error">
            {t("airportSelection.loadError")}
            <button
              onClick={fetchAirports}
              className="ml-2 underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {airports.length === 0
              ? t("airportSelection.noAirports")
              : t("airportSelection.noMatch")}
          </div>
        ) : (
          <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-tv-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider
                      text-tv-text-secondary cursor-pointer select-none hover:text-tv-text-primary transition-colors"
                  >
                    {col.label}
                    <SortIndicator
                      active={sortKey === col.key}
                      dir={sortDir}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((airport) => (
                <tr
                  key={airport.id}
                  onClick={() => selectAirport(airport)}
                  className="border-b border-tv-border last:border-b-0 cursor-pointer
                    text-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{airport.icao_code}</td>
                  <td className="px-4 py-3">{airport.name}</td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {airport.city ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {airport.country ?? "-"}
                  </td>
                  <td className="px-4 py-3">{airport.surfaces_count}</td>
                  <td className="px-4 py-3">{airport.agls_count}</td>
                  <td className="px-4 py-3">{airport.missions_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* pagination bar */}
      {!loading && !error && sorted.length > 0 && (
        <div className="relative flex items-center justify-between w-full max-w-5xl pt-3">
          <span className="absolute left-1/2 -translate-x-1/2 text-xs text-tv-text-secondary">
            {t("airportSelection.showing", { from: showFrom, to: showTo, total: sorted.length })}
          </span>
          <div className="flex items-center gap-1">
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  pageSize === size
                    ? "bg-tv-accent text-tv-accent-text"
                    : "bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary"
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {paginationRange(totalPages, page).map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-tv-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item as number)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    page === item
                      ? "bg-tv-accent text-tv-accent-text"
                      : "bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary"
                  }`}
                >
                  {(item as number) + 1}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <svg className="h-5 w-5 animate-spin text-tv-text-muted" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

function MissionListSection({
  missions,
  loading,
  error,
  onRetry,
  droneProfiles,
}: {
  missions: MissionResponse[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  droneProfiles: DroneProfileResponse[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return missions;
    const q = search.toLowerCase();
    return missions.filter((m) => m.name.toLowerCase().includes(q));
  }, [missions, search]);

  return (
    <CollapsibleSection title={t("dashboard.missions")} count={missions.length}>
      {/* search */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-tv-accent flex-shrink-0">
          <svg className="h-4 w-4 text-tv-accent-text" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dashboard.searchMissions")}
          className="flex-1 rounded-full border border-tv-border bg-tv-bg px-4 py-2 text-xs
            text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent"
          data-testid="mission-search"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="text-center text-xs text-tv-error py-4">
          {t("dashboard.loadError")}
          <button onClick={onRetry} className="ml-2 underline hover:no-underline">
            {t("common.retry")}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-xs text-tv-text-muted py-4">
          {t("dashboard.noMissions")}
        </p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {filtered.map((mission) => {
            const drone = droneProfiles.find(
              (dp) => dp.id === mission.drone_profile_id,
            );
            return (
              <button
                key={mission.id}
                onClick={() => navigate(`/operator-center/missions/${mission.id}/overview`)}
                className="w-full text-left rounded-xl border border-tv-border bg-tv-bg p-3
                  hover:bg-tv-surface-hover transition-colors"
                data-testid={`mission-row-${mission.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-tv-text-primary truncate mr-2">
                    {mission.name}
                  </span>
                  <Badge status={mission.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-tv-text-secondary">
                  <span>{drone ? drone.name : t("dashboard.noDrone")}</span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
                    {"\u2014"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
                    {"\u2014"}
                  </span>
                  <span className="ml-auto">
                    {new Date(mission.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

// stat card definitions
const STAT_CARDS = [
  { key: "totalMissions", icon: FileText, color: "var(--tv-accent)" },
  { key: "avgDuration", icon: Clock, color: "var(--tv-info)" },
  { key: "inspectionsDone", icon: CheckCircle, color: "var(--tv-inspection-4)" },
  { key: "successRate", icon: TrendingUp, color: "var(--tv-accent)" },
] as const;

function StatisticsSection({ missions }: { missions: MissionResponse[] }) {
  const { t } = useTranslation();

  const stats = [
    { ...STAT_CARDS[0], value: String(missions.length), label: t("dashboard.totalMissions") },
    { ...STAT_CARDS[1], value: "\u2014", label: t("dashboard.avgDuration") },
    { ...STAT_CARDS[2], value: "\u2014", label: t("dashboard.inspectionsDone") },
    { ...STAT_CARDS[3], value: "\u2014", label: t("dashboard.successRate") },
  ];

  return (
    <CollapsibleSection title={t("dashboard.statistics")}>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className="rounded-xl border p-3"
            style={{
              backgroundColor: "var(--tv-surface)",
              borderColor: "var(--tv-border)",
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center mb-2"
              style={{ backgroundColor: stat.color + "1a" }}
            >
              <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
            </div>
            <p className="text-2xl font-bold text-tv-text-primary">{stat.value}</p>
            <p className="text-xs text-tv-text-secondary">{stat.label}</p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function DroneProfileRow({ dp, missionCount }: { dp: DroneProfileResponse; missionCount: number }) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center p-3"
      data-testid={`drone-profile-${dp.id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-tv-text-primary">{dp.name}</p>
        <p className="text-xs text-tv-text-secondary">
          {[dp.manufacturer, dp.model].filter(Boolean).join(" \u00B7 ") || "\u2014"}
        </p>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-tv-text-primary">
          <Battery className="w-4 h-4" style={{ color: "var(--tv-accent)" }} />
          {dp.endurance_minutes != null ? `${dp.endurance_minutes} ${t("dashboard.minutes")}` : "\u2014"}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-tv-text-primary">
          <Layers className="w-4 h-4" style={{ color: "var(--tv-info)" }} />
          {missionCount}
        </span>
      </div>
    </div>
  );
}

function DroneProfilesSection({
  profiles,
  loading,
  error,
  missions,
}: {
  profiles: DroneProfileResponse[];
  loading: boolean;
  error: boolean;
  missions: MissionResponse[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // count missions per drone profile
  const missionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of missions) {
      if (m.drone_profile_id) {
        counts[m.drone_profile_id] = (counts[m.drone_profile_id] || 0) + 1;
      }
    }
    return counts;
  }, [missions]);

  const mostUsedId = useMemo(() => {
    let topId: string | null = null;
    let topCount = 0;
    for (const [id, count] of Object.entries(missionCounts)) {
      if (count > topCount) {
        topId = id;
        topCount = count;
      }
    }
    return topId;
  }, [missionCounts]);

  const mostUsed = profiles.find((dp) => dp.id === mostUsedId) ?? profiles[0] ?? null;
  const rest = profiles.filter((dp) => dp.id !== mostUsed?.id);

  return (
    <div className="bg-tv-surface border border-tv-border rounded-3xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-4 text-left"
        data-testid="section-dashboard.droneprofiles"
      >
        <div className="flex-1 flex items-center gap-2">
          <span className="text-base font-semibold text-tv-text-primary rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
            {t("dashboard.droneProfiles")}
          </span>
        </div>
        <svg
          className={`h-5 w-5 flex-shrink-0 text-tv-text-secondary transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
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

      {loading ? (
        <div className="px-4 pb-4">
          <Spinner />
        </div>
      ) : error ? (
        <div className="px-4 pb-4">
          <p className="text-center text-xs text-tv-error py-4" data-testid="drone-profiles-error">
            {t("dashboard.droneLoadError")}
          </p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-center text-xs text-tv-text-muted py-4">
            {t("dashboard.noDroneProfiles")}
          </p>
        </div>
      ) : (
        <>
          {/* always-visible: most used drone preview */}
          {mostUsed && (
            <div className="border-t border-tv-border">
              <p className="px-3 pt-2 text-[10px] font-medium uppercase text-tv-text-muted">
                {t("dashboard.mostUsedDrone")}
              </p>
              <DroneProfileRow dp={mostUsed} missionCount={missionCounts[mostUsed.id] || 0} />
            </div>
          )}

          {/* expanded: all other drone profiles */}
          {expanded && rest.map((dp) => (
            <div key={dp.id} className="border-t border-tv-border">
              <DroneProfileRow dp={dp} missionCount={missionCounts[dp.id] || 0} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DashboardView() {
  const { t } = useTranslation();
  const {
    selectedAirport,
    airportDetail,
    airportDetailLoading,
    airportDetailError,
    refreshAirportDetail,
  } = useAirport();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [missionsError, setMissionsError] = useState(false);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>([]);
  const [droneProfilesLoading, setDroneProfilesLoading] = useState(true);
  const [droneProfilesError, setDroneProfilesError] = useState(false);
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);

  const fetchMissions = useCallback(() => {
    if (!selectedAirport) return;
    setMissionsLoading(true);
    setMissionsError(false);
    listMissions({ airport_id: selectedAirport.id })
      .then((res) => setMissions(res.data))
      .catch(() => setMissionsError(true))
      .finally(() => setMissionsLoading(false));
  }, [selectedAirport]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  useEffect(() => {
    setDroneProfilesLoading(true);
    setDroneProfilesError(false);
    listDroneProfiles()
      .then((res) => setDroneProfiles(res.data))
      .catch(() => setDroneProfilesError(true))
      .finally(() => setDroneProfilesLoading(false));
  }, []);

  if (!selectedAirport) return null;

  return (
    <div className="flex p-4 h-full">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-4">
          <MissionListSection
            missions={missions}
            loading={missionsLoading}
            error={missionsError}
            onRetry={fetchMissions}
            droneProfiles={droneProfiles}
          />

          <Button
            className="w-full"
            onClick={() => setShowCreateDialog(true)}
            data-testid="new-mission-btn"
          >
            {t("dashboard.newMission")}
          </Button>

          <StatisticsSection missions={missions} />
          <DroneProfilesSection profiles={droneProfiles} loading={droneProfilesLoading} error={droneProfilesError} missions={missions} />
        </div>
        <div className="w-2.5 flex-shrink-0" />
      </div>

      {/* right panel - 70% */}
      <div className="flex-1">
        {airportDetailLoading ? (
          <div
            className="h-full rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--tv-map-bg)" }}
          >
            <Spinner />
          </div>
        ) : airportDetailError ? (
          <div
            className="h-full rounded-2xl flex flex-col items-center justify-center gap-3"
            style={{ backgroundColor: "var(--tv-map-bg)" }}
            data-testid="map-error"
          >
            <p className="text-sm text-tv-error">{t("common.error")}</p>
            <Button variant="secondary" onClick={refreshAirportDetail}>
              {t("common.retry")}
            </Button>
          </div>
        ) : airportDetail ? (
          <div className="relative h-full">
            <AirportMap
              airport={airportDetail}
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              is3D={is3D}
              onToggle3D={setIs3D}
            />
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <div className="flex rounded-full border border-tv-border bg-tv-surface p-1">
                <button
                  onClick={() => setIs3D(false)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => setIs3D(true)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    is3D ? "bg-tv-accent text-tv-accent-text" : "text-tv-text-secondary"
                  }`}
                >
                  3D
                </button>
              </div>
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
            </div>
          </div>
        ) : (
          <div
            className="h-full rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--tv-map-bg)" }}
          >
            <Spinner />
          </div>
        )}
      </div>

      <CreateMissionDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        airportId={selectedAirport.id}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { selectedAirport } = useAirport();

  if (!selectedAirport) {
    return <AirportSelectionView />;
  }

  return <DashboardView />;
}
