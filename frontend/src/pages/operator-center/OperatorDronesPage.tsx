import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye } from "lucide-react";
import { listDroneProfiles } from "@/api/droneProfiles";
import { setDefaultDrone, bulkChangeDrone } from "@/api/airports";
import { useAirport } from "@/contexts/AirportContext";
import type { DroneProfileResponse } from "@/types/droneProfile";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  Pagination,
  SortIndicator,
} from "@/components/common/ListPageLayout";
import { DroneModelThumbnail } from "@/components/drone/DroneModelViewer";
import { getBundledModel } from "@/config/droneModels";

type SortKey =
  | "name"
  | "manufacturer"
  | "model"
  | "max_speed"
  | "endurance_minutes"
  | "mission_count";

type SortDir = "asc" | "desc";

export default function OperatorDronesPage() {
  const { t } = useTranslation();
  const { selectedAirport, refreshAirportDetail } = useAirport();

  const [drones, setDrones] = useState<DroneProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");

  // sort
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // bulk change dialog
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkDroneId, setBulkDroneId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // notifications
  const [notification, setNotification] = useState("");
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDrones = useCallback(() => {
    setLoading(true);
    setError(false);
    listDroneProfiles({ limit: 200 })
      .then((res) => setDrones(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDrones();
  }, [fetchDrones]);

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  function showToast(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(""), 3000);
  }

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const d of drones) {
      if (d.manufacturer) set.add(d.manufacturer);
    }
    return Array.from(set).sort();
  }, [drones]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      const numeric: SortKey[] = [
        "max_speed",
        "endurance_minutes",
        "mission_count",
      ];
      setSortKey(key);
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return drones.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (manufacturerFilter && d.manufacturer !== manufacturerFilter)
        return false;
      return true;
    });
  }, [drones, search, manufacturerFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "manufacturer":
          av = a.manufacturer || "";
          bv = b.manufacturer || "";
          break;
        case "model":
          av = a.model || "";
          bv = b.model || "";
          break;
        case "max_speed":
          av = a.max_speed ?? -1;
          bv = b.max_speed ?? -1;
          break;
        case "endurance_minutes":
          av = a.endurance_minutes ?? -1;
          bv = b.endurance_minutes ?? -1;
          break;
        case "mission_count":
          av = a.mission_count;
          bv = b.mission_count;
          break;
      }

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

  function resolveModelUrl(identifier: string | null): string | null {
    if (!identifier) return null;
    const bundled = getBundledModel(identifier);
    if (bundled) return bundled.path;
    return `/static/models/custom/${identifier}`;
  }

  async function handleToggleDefault(droneId: string) {
    if (!selectedAirport) return;
    const isDefault = selectedAirport.default_drone_profile_id === droneId;
    try {
      await setDefaultDrone(selectedAirport.id, isDefault ? null : droneId);
      await refreshAirportDetail();
      showToast(
        isDefault
          ? t("operatorDrones.removeDefault")
          : t("operatorDrones.defaultBadge"),
      );
    } catch {
      showToast(t("common.error"));
    }
  }

  async function handleBulkChange(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAirport || !bulkDroneId) return;
    setBulkLoading(true);
    try {
      const result = await bulkChangeDrone(selectedAirport.id, bulkDroneId);
      setShowBulkDialog(false);
      setBulkDroneId("");
      if (result.updated_count === 0) {
        showToast(t("operatorDrones.noMissions"));
      } else {
        showToast(
          t("operatorDrones.bulkChangeSuccess", {
            count: result.updated_count,
          }),
        );
      }
    } catch {
      showToast(t("common.error"));
    } finally {
      setBulkLoading(false);
    }
  }

  const defaultDroneId = selectedAirport?.default_drone_profile_id;

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: t("coordinator.drones.columns.name") },
    {
      key: "manufacturer",
      label: t("coordinator.drones.columns.manufacturer"),
    },
    { key: "model", label: t("coordinator.drones.columns.model") },
    { key: "max_speed", label: t("coordinator.drones.columns.maxSpeed") },
    {
      key: "endurance_minutes",
      label: t("coordinator.drones.columns.endurance"),
    },
    { key: "mission_count", label: t("coordinator.drones.columns.missions") },
  ];

  return (
    <ListPageContainer>
      {/* top row */}
      <SearchBar
        value={search}
        onChange={handleSearchChange}
        placeholder={t("coordinator.drones.searchPlaceholder")}
        testId="drone-search"
      >
        <select
          value={manufacturerFilter}
          onChange={(e) => {
            setManufacturerFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-full border border-tv-border bg-tv-surface px-4 h-10 text-sm
            text-tv-text-primary focus:outline-none focus:border-tv-accent"
          data-testid="manufacturer-filter"
        >
          <option value="">
            {t("coordinator.drones.allManufacturers")}
          </option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button
          onClick={() => setShowBulkDialog(true)}
          variant="secondary"
          data-testid="bulk-change-btn"
        >
          {t("operatorDrones.bulkChange")}
        </Button>
      </SearchBar>

      {/* drone table */}
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
            {t("coordinator.drones.loadError")}
            <button
              onClick={fetchDrones}
              className="ml-2 underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {drones.length === 0
              ? t("coordinator.drones.noDrones")
              : t("coordinator.drones.noMatch")}
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
              {paged.map((drone) => {
                const isDefault = defaultDroneId === drone.id;
                return (
                  <tr
                    key={drone.id}
                    className="border-b border-tv-border last:border-b-0
                      text-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                    data-testid={`drone-row-${drone.id}`}
                  >
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-[var(--tv-surface-hover)] flex-shrink-0 overflow-hidden">
                          <DroneModelThumbnail
                            modelUrl={resolveModelUrl(drone.model_identifier)}
                            size={128}
                            className="h-full w-full"
                          />
                        </div>
                        <span>{drone.name}</span>
                        {isDefault && (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]">
                            {t("operatorDrones.defaultBadge")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {drone.manufacturer || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {drone.model || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {drone.max_speed != null
                        ? `${drone.max_speed} ${t("coordinator.drones.units.ms")}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {drone.endurance_minutes != null
                        ? `${drone.endurance_minutes} ${t("coordinator.drones.units.min")}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-tv-text-secondary">
                      {drone.mission_count}
                    </td>
                    <td className="px-4 py-3">
                      <RowActionButtons
                        actions={[
                          {
                            icon: isDefault ? Check : Eye,
                            onClick: () => handleToggleDefault(drone.id),
                            title: isDefault
                              ? t("operatorDrones.removeDefault")
                              : t("operatorDrones.setDefault"),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ListPageContent>

      {/* pagination */}
      {!loading && !error && sorted.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={sorted.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          showingKey="coordinator.drones.showing"
        />
      )}

      {/* bulk change dialog */}
      <Modal
        isOpen={showBulkDialog}
        onClose={() => {
          setShowBulkDialog(false);
          setBulkDroneId("");
        }}
        title={t("operatorDrones.bulkChange")}
      >
        <form onSubmit={handleBulkChange}>
          <div>
            <label
              htmlFor="bulk-drone-select"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("dashboard.selectDrone")}
            </label>
            <select
              id="bulk-drone-select"
              value={bulkDroneId}
              onChange={(e) => setBulkDroneId(e.target.value)}
              className="w-full rounded-full border border-tv-border bg-tv-bg px-4 py-2.5 text-sm
                text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="bulk-drone-select"
            >
              <option value="">{t("dashboard.selectDronePlaceholder")}</option>
              {drones.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name}
                </option>
              ))}
            </select>
          </div>
          {bulkDroneId && selectedAirport && (
            <p className="mt-3 text-sm text-tv-text-secondary">
              {t("operatorDrones.bulkChangeConfirm", {
                airport: selectedAirport.name,
              })}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowBulkDialog(false);
                setBulkDroneId("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!bulkDroneId || bulkLoading}>
              {bulkLoading
                ? t("common.loading")
                : t("operatorDrones.bulkChange")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* toast notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-tv-border bg-tv-surface px-4 py-3 text-sm text-tv-text-primary">
          {notification}
        </div>
      )}
    </ListPageContainer>
  );
}
