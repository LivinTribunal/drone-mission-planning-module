import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listAirportSummaries } from "@/api/airports";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportSummaryResponse } from "@/types/airport";
import Button from "@/components/common/Button";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  Pagination,
  SortIndicator,
} from "@/components/common/ListPageLayout";
import CreateAirportDialog from "@/components/coordinator/CreateAirportDialog";

type SortKey =
  | "icao_code"
  | "name"
  | "city"
  | "country"
  | "surfaces_count"
  | "agls_count"
  | "missions_count";

type SortDir = "asc" | "desc";

export default function AirportListPage() {
  /** airport list page with search, filters, sortable table, and pagination. */
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectAirport } = useAirport();
  const [airports, setAirports] = useState<AirportSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [hasAglFilter, setHasAglFilter] = useState(false);

  // sort
  const [sortKey, setSortKey] = useState<SortKey>("icao_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchAirports = useCallback(async () => {
    /** load airport summaries from api. */
    setLoading(true);
    setError(false);
    try {
      const result = await listAirportSummaries();
      setAirports(result.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  const countries = useMemo(() => {
    /** extract unique country values for filter dropdown. */
    const set = new Set<string>();
    airports.forEach((a) => {
      if (a.country) set.add(a.country);
    });
    return Array.from(set).sort();
  }, [airports]);

  const NUMERIC_KEYS: SortKey[] = ["surfaces_count", "agls_count", "missions_count"];

  function handleSort(key: SortKey) {
    /** toggle sort direction or switch sort column. desc default for numeric columns. */
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(NUMERIC_KEYS.includes(key) ? "desc" : "asc");
    }
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

  function handleRowClick(airport: AirportSummaryResponse) {
    /** select airport in context and navigate to detail editor. */
    selectAirport(airport);
    navigate(`/coordinator-center/airports/${airport.id}`);
  }

  function handleCreated(id: string) {
    /** close dialog and navigate to newly created airport. */
    setShowCreateDialog(false);
    navigate(`/coordinator-center/airports/${id}`);
  }

  // filtering
  const filtered = useMemo(() => {
    let result = airports;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.icao_code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.city && a.city.toLowerCase().includes(q)),
      );
    }
    if (countryFilter) {
      result = result.filter((a) => a.country === countryFilter);
    }
    if (hasAglFilter) {
      result = result.filter((a) => a.agls_count > 0);
    }
    return result;
  }, [airports, search, countryFilter, hasAglFilter]);

  // sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortDir]);

  // pagination
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const columns: { key: SortKey; label: string }[] = [
    { key: "icao_code", label: t("coordinator.airportList.columns.icaoCode") },
    { key: "name", label: t("coordinator.airportList.columns.name") },
    { key: "city", label: t("coordinator.airportList.columns.city") },
    { key: "country", label: t("coordinator.airportList.columns.country") },
    { key: "surfaces_count", label: t("coordinator.airportList.columns.runways") },
    { key: "agls_count", label: t("coordinator.airportList.columns.aglSystems") },
    { key: "missions_count", label: t("coordinator.airportList.columns.missions") },
  ];

  return (
    <ListPageContainer data-testid="airport-list-page">
      {/* search bar + filters + add button */}
      <SearchBar
        value={search}
        onChange={handleSearchChange}
        placeholder={t("coordinator.airportList.searchPlaceholder")}
        testId="airport-search-input"
      >
        {/* country filter */}
        <select
          value={countryFilter}
          onChange={(e) => { setCountryFilter(e.target.value); setPage(0); }}
          className="rounded-full border border-tv-border bg-tv-surface px-4 py-1.5 text-sm
            text-tv-text-primary focus:outline-none focus:border-tv-accent"
          data-testid="country-filter"
        >
          <option value="">{t("coordinator.airportList.filterCountry")}</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* has agl toggle */}
        <label className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm border border-tv-border bg-tv-surface cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasAglFilter}
            onChange={(e) => { setHasAglFilter(e.target.checked); setPage(0); }}
            className="accent-tv-accent"
            data-testid="agl-filter"
          />
          <span className="text-tv-text-primary whitespace-nowrap">{t("coordinator.airportList.filterHasAgl")}</span>
        </label>

        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="add-airport-button"
        >
          {t("coordinator.airportList.addAirport")}
        </Button>
      </SearchBar>

      {/* airport table */}
      <ListPageContent className="rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="h-6 w-6 animate-spin text-tv-text-muted" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-tv-error">
            {t("coordinator.airportList.loadError")}
            <button onClick={fetchAirports} className="ml-2 underline hover:no-underline">
              {t("common.retry")}
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {airports.length === 0
              ? t("coordinator.airportList.noAirports")
              : t("coordinator.airportList.noMatch")}
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
              </tr>
            </thead>
            <tbody>
              {paged.map((airport) => (
                <tr
                  key={airport.id}
                  onClick={() => handleRowClick(airport)}
                  className="border-b border-tv-border last:border-b-0 cursor-pointer
                    text-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                  data-testid={`airport-row-${airport.id}`}
                >
                  <td className="px-4 py-3 font-semibold text-tv-accent">
                    {airport.icao_code}
                  </td>
                  <td className="px-4 py-3">{airport.name}</td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {airport.city ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {airport.country ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary text-center">
                    {airport.surfaces_count}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary text-center">
                    {airport.agls_count}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary text-center">
                    {airport.missions_count}
                  </td>
                </tr>
              ))}
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
          showingKey="coordinator.airportList.showing"
        />
      )}

      {/* create airport dialog */}
      <CreateAirportDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleCreated}
      />
    </ListPageContainer>
  );
}
