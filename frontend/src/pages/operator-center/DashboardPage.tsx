import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import { listAirportSummaries } from "@/api/airports";
import type { AirportSummaryResponse } from "@/types/airport";
import CollapsibleSection from "@/components/common/CollapsibleSection";

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
        <div className="flex flex-col items-center w-full max-w-5xl pt-3 gap-2">
          <span className="text-xs text-tv-text-secondary">
            {t("airportSelection.showing", { from: showFrom, to: showTo, total: sorted.length })}
          </span>

          <div className="flex items-center justify-between w-full">
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
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  page === i
                    ? "bg-tv-accent text-tv-accent-text"
                    : "bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary"
                }`}
              >
                {i + 1}
              </button>
            ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { selectedAirport } = useAirport();
  const { t } = useTranslation();

  if (!selectedAirport) {
    return <AirportSelectionView />;
  }

  return (
    <div className="flex gap-6 p-4 h-full">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 overflow-auto flex flex-col gap-4">
        <CollapsibleSection title={t("dashboard.missionOverview")}>
          <p className="text-sm text-tv-text-muted">{t("common.comingSoon")}</p>
        </CollapsibleSection>
        <CollapsibleSection title={t("dashboard.activeMissions")}>
          <p className="text-sm text-tv-text-muted">{t("common.comingSoon")}</p>
        </CollapsibleSection>
        <CollapsibleSection title={t("dashboard.droneStatus")}>
          <p className="text-sm text-tv-text-muted">{t("common.comingSoon")}</p>
        </CollapsibleSection>
        <CollapsibleSection title={t("dashboard.recentActivity")}>
          <p className="text-sm text-tv-text-muted">{t("common.comingSoon")}</p>
        </CollapsibleSection>
      </div>

      {/* right panel - 70% */}
      <div
        className="flex-1 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "var(--tv-map-bg)" }}
      >
        <p className="text-sm text-tv-text-muted">{t("dashboard.mapPlaceholder")}</p>
      </div>
    </div>
  );
}
