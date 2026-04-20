import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { listMissions, deleteMission, duplicateMission, updateMission } from "@/api/missions";
import { useDroneProfiles } from "@/api/queries/droneProfiles";
import type { MissionResponse } from "@/types/mission";
import type { MissionStatus } from "@/types/enums";
import Badge from "@/components/common/Badge";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import RowActionButtons from "@/components/common/RowActionButtons";
import CreateMissionDialog from "@/components/mission/CreateMissionDialog";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  Pagination,
  SortIndicator,
} from "@/components/common/ListPageLayout";

type SortKey =
  | "name"
  | "status"
  | "drone"
  | "inspections"
  | "duration"
  | "created_at"
  | "updated_at";

type SortDir = "asc" | "desc";

const ALL_STATUSES: MissionStatus[] = [
  "DRAFT",
  "PLANNED",
  "VALIDATED",
  "EXPORTED",
  "COMPLETED",
  "CANCELLED",
];


export default function MissionListPage() {
  /** full-width mission list page shown when no mission is selected. */
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedAirport } = useAirport();

  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const { data: droneData } = useDroneProfiles();
  const droneProfiles = droneData?.data ?? [];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<MissionStatus>>(
    new Set(ALL_STATUSES),
  );
  const [droneFilter, setDroneFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // sort
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MissionResponse | null>(null);
  const [renameTarget, setRenameTarget] = useState<MissionResponse | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const droneMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const dp of droneProfiles) {
      m.set(dp.id, dp.name);
    }
    return m;
  }, [droneProfiles]);

  const fetchMissions = useCallback(() => {
    /** fetch missions for the selected airport. */
    if (!selectedAirport) return;
    setLoading(true);
    setError(false);
    listMissions({ airport_id: selectedAirport.id, limit: 200 })
      .then((res) => setMissions(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [selectedAirport]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);


  function toggleStatus(status: MissionStatus) {
    /** toggle a status filter pill on/off. */
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
    setPage(0);
  }

  function handleSort(key: SortKey) {
    /** toggle sort direction or switch sort column. */
    const numeric: SortKey[] = ["inspections", "duration", "created_at", "updated_at"];
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  }

  // filtering
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return missions.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (activeStatuses.size > 0 && !activeStatuses.has(m.status)) return false;
      if (droneFilter && m.drone_profile_id !== droneFilter) return false;
      if (dateFrom) {
        const created = new Date(m.created_at).toISOString().slice(0, 10);
        if (created < dateFrom) return false;
      }
      if (dateTo) {
        const created = new Date(m.created_at).toISOString().slice(0, 10);
        if (created > dateTo) return false;
      }
      return true;
    });
  }, [missions, search, activeStatuses, droneFilter, dateFrom, dateTo]);

  // sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "drone":
          av = (a.drone_profile_id && droneMap.get(a.drone_profile_id)) || "";
          bv = (b.drone_profile_id && droneMap.get(b.drone_profile_id)) || "";
          break;
        case "created_at":
          av = a.created_at;
          bv = b.created_at;
          break;
        default:
          av = "";
          bv = "";
      }

      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, droneMap]);

  // pagination
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  async function handleDelete() {
    /** delete the targeted mission and refresh the list. */
    if (!deleteTarget) return;
    try {
      await deleteMission(deleteTarget.id);
      fetchMissions();
    } catch {
      // ignore
    }
    setDeleteTarget(null);
  }

  async function handleDuplicate(mission: MissionResponse) {
    /** duplicate a mission and refresh the list. */
    try {
      await duplicateMission(mission.id);
      fetchMissions();
    } catch {
      // ignore
    }
  }

  async function handleRenameConfirm() {
    /** confirm rename and refresh the list. */
    if (!renameTarget || !renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    try {
      await updateMission(renameTarget.id, { name: renameValue.trim() });
      fetchMissions();
    } catch {
      // ignore
    }
    setRenameTarget(null);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    /** update search and reset to first page. */
    setSearch(e.target.value);
    setPage(0);
  }

  function handlePageSizeChange(size: number) {
    /** change page size and reset to first page. */
    setPageSize(size);
    setPage(0);
  }

  if (!selectedAirport) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <p className="text-sm text-tv-text-muted">{t("nav.selectAirport")}</p>
      </div>
    );
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: t("missionList.columns.name") },
    { key: "status", label: t("missionList.columns.status") },
    { key: "drone", label: t("missionList.columns.drone") },
    { key: "inspections", label: t("missionList.columns.inspections") },
    { key: "duration", label: t("missionList.columns.duration") },
    { key: "created_at", label: t("missionList.columns.created") },
    { key: "updated_at", label: t("missionList.columns.lastUpdated") },
  ];

  function formatDuration(seconds: number | null): string {
    /** format duration in seconds to a human-readable string. */
    if (seconds == null) return "\u2014";
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  }

  return (
    <ListPageContainer>
      <SearchBar
        value={search}
        onChange={handleSearchChange}
        placeholder={t("missionList.searchPlaceholder")}
        testId="mission-list-search"
      >
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="new-mission-btn"
        >
          {t("missionList.newMission")}
        </Button>
      </SearchBar>

      {/* filter row */}
      <ListPageContent className="mb-4">
        <div className="flex items-center rounded-full border border-tv-border bg-tv-surface px-3 py-2">
          {/* status pills */}
          <div className="flex items-center gap-1.5">
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  activeStatuses.has(status)
                    ? `bg-[var(--tv-status-${status.toLowerCase()}-bg)] text-[var(--tv-status-${status.toLowerCase()}-text)]`
                    : "bg-tv-bg text-tv-text-muted hover:text-tv-text-secondary"
                }`}
                data-testid={`status-filter-${status}`}
              >
                {t(`missionStatus.${status}`)}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-tv-border mx-3" />

          {/* right-aligned filters */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={droneFilter}
              onChange={(e) => { setDroneFilter(e.target.value); setPage(0); }}
              className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs
                text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="drone-filter"
            >
              <option value="">{t("missionList.filters.allDrones")}</option>
              {droneProfiles.map((dp) => (
                <option key={dp.id} value={dp.id}>{dp.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <label className="text-xs text-tv-text-secondary">{t("missionList.filters.from")}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs
                  text-tv-text-primary focus:outline-none focus:border-tv-accent"
                data-testid="date-from"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-tv-text-secondary">{t("missionList.filters.to")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs
                  text-tv-text-primary focus:outline-none focus:border-tv-accent"
                data-testid="date-to"
              />
            </div>
          </div>
        </div>
      </ListPageContent>

      {/* mission table */}
      <ListPageContent>
        <div className="rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <svg className="h-6 w-6 animate-spin text-tv-text-muted" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center text-sm text-tv-error">
              {t("missionList.loadError")}
              <button onClick={fetchMissions} className="ml-2 underline hover:no-underline">
                {t("common.retry")}
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
              {missions.length === 0
                ? t("missionList.noMissions")
                : t("missionList.noMatch")}
            </div>
          ) : (
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
                      <SortIndicator active={sortKey === col.key} dir={sortDir} />
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {paged.map((mission) => (
                  <tr
                    key={mission.id}
                    onClick={() => navigate(`/operator-center/missions/${mission.id}/overview`)}
                    className="border-b border-tv-border last:border-b-0 cursor-pointer
                      text-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                    data-testid={`mission-row-${mission.id}`}
                  >
                    <td className="px-4 py-3 font-medium">{mission.name}</td>
                    <td className="px-4 py-3">
                      <Badge status={mission.status} />
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {(mission.drone_profile_id && droneMap.get(mission.drone_profile_id)) || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {mission.inspection_count || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {formatDuration(mission.estimated_duration)}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {new Date(mission.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {new Date(mission.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <RowActionButtons
                        actions={[
                          {
                            icon: Copy,
                            onClick: () => handleDuplicate(mission),
                            title: t("missionList.actions.duplicate"),
                          },
                          {
                            icon: Pencil,
                            onClick: () => {
                              setRenameTarget(mission);
                              setRenameValue(mission.name);
                            },
                            title: t("missionList.actions.rename"),
                          },
                          {
                            icon: Trash2,
                            onClick: () => setDeleteTarget(mission),
                            title: t("missionList.actions.delete"),
                            variant: "danger",
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </ListPageContent>

      {/* pagination */}
      {!loading && !error && sorted.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={sorted.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          showingKey="missionList.showing"
        />
      )}

      {/* create mission dialog */}
      <CreateMissionDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        airportId={selectedAirport.id}
      />

      {/* delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("common.delete")}
      >
        <p className="text-sm text-tv-text-primary mb-6">
          {t("missionList.deleteConfirm", { name: deleteTarget?.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </Modal>

      {/* rename dialog */}
      <Modal
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={t("missionList.renameTitle")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRenameConfirm();
          }}
        >
          <Input
            id="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t("missionList.renamePlaceholder")}
            data-testid="rename-input"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!renameValue.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </ListPageContainer>
  );
}
