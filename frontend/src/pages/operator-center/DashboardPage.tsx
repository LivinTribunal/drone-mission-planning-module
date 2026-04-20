import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  Clock,
  FileText,
  CheckCircle,
  TrendingUp,
  Battery,
  Map,
  Download,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { useMission } from "@/contexts/MissionContext";
import { updateMission, deleteMission, duplicateMission } from "@/api/missions";
import { useAirportSummaries } from "@/api/queries/airports";
import { useDroneProfiles } from "@/api/queries/droneProfiles";
import type { MissionResponse } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import CollapsibleSection from "@/components/common/CollapsibleSection";
import Badge from "@/components/common/Badge";
import Button from "@/components/common/Button";
import RowActionButtons from "@/components/common/RowActionButtons";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  Pagination,
  SortIndicator,
} from "@/components/common/ListPageLayout";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import type { MapFeature } from "@/types/map";
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

function AirportSelectionView() {
  const { selectAirport } = useAirport();
  const { t } = useTranslation();
  const { data: summariesData, isLoading: loading, isError: error, refetch } = useAirportSummaries();
  const airports = summariesData?.data ?? [];
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

  function handleSort(key: SortKey) {
    const numeric: SortKey[] = ["surfaces_count", "agls_count", "missions_count"];
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(numeric.includes(key) ? "desc" : "asc");
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

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setPage(0);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(0);
  }

  return (
    <ListPageContainer>
      <SearchBar
        value={search}
        onChange={handleSearchChange}
        placeholder={t("airportSelection.searchPlaceholder")}
        testId="dashboard-search"
      />

      <ListPageContent className="rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
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
              onClick={() => refetch()}
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
      </ListPageContent>

      {/* pagination bar */}
      {!loading && !error && sorted.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={sorted.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          showingKey="airportSelection.showing"
        />
      )}
    </ListPageContainer>
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

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MissionListSection({
  missions,
  loading,
  error,
  onRetry,
  onRefresh,
  droneProfiles,
  headerRight,
}: {
  missions: MissionResponse[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  droneProfiles: DroneProfileResponse[];
  headerRight?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return missions;
    const q = search.toLowerCase();
    return missions.filter((m) => m.name.toLowerCase().includes(q));
  }, [missions, search]);

  async function handleDuplicate(mission: MissionResponse) {
    /** duplicate a mission and refresh the list. */
    try {
      await duplicateMission(mission.id);
      onRefresh();
    } catch (err) {
      console.error("duplicate mission failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRename(missionId: string) {
    if (!renameValue.trim()) return;
    try {
      await updateMission(missionId, { name: renameValue.trim() });
      setRenamingId(null);
      onRefresh();
    } catch (err) {
      console.error("rename mission failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(missionId: string) {
    try {
      await deleteMission(missionId);
      setDeletingId(null);
      onRefresh();
    } catch (err) {
      console.error("delete mission failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const isTerminal = (status: string) => status === "COMPLETED" || status === "CANCELLED";

  return (
    <CollapsibleSection title={t("dashboard.missions")} count={missions.length} headerRight={headerRight}>
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
            const terminal = isTerminal(mission.status);
            return (
              <div key={mission.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/operator-center/missions/${mission.id}/overview`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/operator-center/missions/${mission.id}/overview`); }}
                  className="w-full text-left rounded-xl border border-tv-border bg-tv-bg p-3
                    hover:bg-tv-surface-hover transition-colors cursor-pointer"
                  data-testid={`mission-row-${mission.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-tv-text-primary truncate mr-2">
                      {mission.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <RowActionButtons
                        actions={[
                          {
                            icon: Map,
                            onClick: () => navigate(`/operator-center/missions/${mission.id}/map`),
                            title: t("dashboard.mapAction"),
                          },
                          {
                            icon: Download,
                            onClick: () => navigate(`/operator-center/missions/${mission.id}/validation-export`),
                            disabled: terminal,
                            title: t("dashboard.exportAction"),
                          },
                          {
                            icon: Copy,
                            onClick: () => handleDuplicate(mission),
                            title: t("dashboard.duplicateAction"),
                          },
                          {
                            icon: Pencil,
                            onClick: () => { setRenamingId(mission.id); setRenameValue(mission.name); },
                            title: t("dashboard.renameAction"),
                          },
                          {
                            icon: Trash2,
                            onClick: () => setDeletingId(mission.id),
                            disabled: terminal,
                            variant: "danger",
                            title: t("dashboard.deleteAction"),
                          },
                        ]}
                      />
                      <Badge status={mission.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-tv-text-secondary">
                    <span>{drone ? drone.name : t("dashboard.noDrone")}</span>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
                      {mission.inspection_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
                      {mission.estimated_duration != null ? formatDuration(mission.estimated_duration) : "\u2014"}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <span className="text-xs" style={{ color: "var(--tv-text-muted)" }}>{t("dashboard.lastSaved")}</span>
                      <span className="text-xs" style={{ color: "var(--tv-text-secondary)" }}>{new Date(mission.updated_at).toLocaleDateString()}</span>
                    </span>
                  </div>
                </div>

                {/* rename dialog */}
                {renamingId === mission.id && (
                  <div className="mt-1 p-2 rounded-xl border border-tv-border bg-tv-surface flex items-center gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(mission.id); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs text-tv-text-primary focus:outline-none focus:border-tv-accent"
                      placeholder={t("dashboard.renamePlaceholder")}
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(mission.id)}
                      className="rounded-full px-3 py-1 text-xs font-medium bg-tv-accent text-tv-accent-text"
                    >
                      {t("common.save")}
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="rounded-full px-3 py-1 text-xs font-medium text-tv-text-secondary hover:text-tv-text-primary"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}

                {/* delete confirmation */}
                {deletingId === mission.id && (
                  <div className="mt-1 p-2 rounded-xl border border-tv-error/30 bg-tv-surface flex items-center gap-2">
                    <span className="flex-1 text-xs text-tv-text-primary">
                      {t("dashboard.deleteConfirm", { name: mission.name })}
                    </span>
                    <button
                      onClick={() => handleDelete(mission.id)}
                      className="rounded-full px-3 py-1 text-xs font-medium bg-tv-error text-white"
                    >
                      {t("common.delete")}
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="rounded-full px-3 py-1 text-xs font-medium text-tv-text-secondary hover:text-tv-text-primary"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
              </div>
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

  const avgDuration = useMemo(() => {
    const withDuration = missions.filter((m) => m.estimated_duration != null);
    if (withDuration.length === 0) return "\u2014";
    const avg = withDuration.reduce((sum, m) => sum + m.estimated_duration!, 0) / withDuration.length;
    return formatDuration(avg);
  }, [missions]);

  const inspectionsDone = useMemo(() => {
    return String(missions.filter((m) => m.status === "COMPLETED").reduce((sum, m) => sum + m.inspection_count, 0));
  }, [missions]);

  const successRate = useMemo(() => {
    const nonDraft = missions.filter((m) => m.status !== "DRAFT");
    if (nonDraft.length === 0) return "\u2014";
    const completed = nonDraft.filter((m) => m.status === "COMPLETED").length;
    return `${Math.round((completed / nonDraft.length) * 100)}%`;
  }, [missions]);

  const stats = [
    { ...STAT_CARDS[0], value: String(missions.length), label: t("dashboard.totalMissions") },
    { ...STAT_CARDS[1], value: avgDuration, label: t("dashboard.avgDuration") },
    { ...STAT_CARDS[2], value: inspectionsDone, label: t("dashboard.inspectionsDone") },
    { ...STAT_CARDS[3], value: successRate, label: t("dashboard.successRate") },
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
  defaultDroneProfileId,
}: {
  profiles: DroneProfileResponse[];
  loading: boolean;
  error: boolean;
  missions: MissionResponse[];
  defaultDroneProfileId?: string | null;
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

  const defaultDrone = defaultDroneProfileId
    ? profiles.find((dp) => dp.id === defaultDroneProfileId) ?? null
    : null;
  const mostUsed = profiles.find((dp) => dp.id === mostUsedId) ?? profiles[0] ?? null;
  const featured = defaultDrone ?? mostUsed;
  const featuredLabel = defaultDrone
    ? t("operatorDrones.defaultDrone")
    : t("dashboard.mostUsedDrone");
  const rest = profiles.filter((dp) => dp.id !== featured?.id);

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
          {featured && (
            <div className="border-t border-tv-border">
              <p className="px-3 pt-2 text-[10px] font-medium uppercase text-tv-text-muted">
                {featuredLabel}
              </p>
              <DroneProfileRow dp={featured} missionCount={missionCounts[featured.id] || 0} />
            </div>
          )}

          {/* expanded: all other drone profiles */}
          {expanded && (
            <div className="max-h-60 overflow-y-auto">
              {rest.map((dp) => (
                <div key={dp.id} className="border-t border-tv-border">
                  <DroneProfileRow dp={dp} missionCount={missionCounts[dp.id] || 0} />
                </div>
              ))}
            </div>
          )}
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
  const {
    missions,
    missionsLoading,
    refreshMissions,
  } = useMission();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [missionsError, setMissionsError] = useState(false);
  const { data: droneData, isLoading: droneProfilesLoading, isError: droneProfilesError } = useDroneProfiles();
  const droneProfiles = droneData?.data ?? [];
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");
  const [is3D, setIs3D] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MapFeature | null>(null);

  const fetchMissions = useCallback(() => {
    setMissionsError(false);
    refreshMissions().catch(() => setMissionsError(true));
  }, [refreshMissions]);

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
            onRefresh={fetchMissions}
            droneProfiles={droneProfiles}
            headerRight={
              <Button
                onClick={() => setShowCreateDialog(true)}
                data-testid="new-mission-btn"
                className="!h-8 !px-3 !text-xs"
              >
                {t("dashboard.newMission")}
              </Button>
            }
          />

          <StatisticsSection missions={missions} />
          <DroneProfilesSection profiles={droneProfiles} loading={droneProfilesLoading} error={droneProfilesError} missions={missions} defaultDroneProfileId={selectedAirport?.default_drone_profile_id} />
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
              onFeatureClick={setSelectedFeature}
              focusFeature={selectedFeature}
              helpVariant="preview"
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
        defaultDroneProfileId={selectedAirport.default_drone_profile_id}
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
