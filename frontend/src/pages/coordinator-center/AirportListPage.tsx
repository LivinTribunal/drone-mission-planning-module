import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { listAirportSummaries } from "@/api/airports";
import type { AirportSummaryResponse } from "@/types/airport";
import AirportTable from "@/components/coordinator/AirportTable";
import AirportSearchBar from "@/components/coordinator/AirportSearchBar";
import CreateAirportDialog from "@/components/coordinator/CreateAirportDialog";

export default function AirportListPage() {
  /** full airport list page with search, filters, sortable table, and create dialog. */
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [airports, setAirports] = useState<AirportSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [hasAglFilter, setHasAglFilter] = useState(false);
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

  const filtered = useMemo(() => {
    /** apply client-side search and filters. */
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

  function handleRowClick(id: string) {
    /** navigate to airport detail editor. */
    navigate(`/coordinator-center/airports/${id}`);
  }

  function handleCreated(id: string) {
    /** close dialog and navigate to newly created airport. */
    setShowCreateDialog(false);
    navigate(`/coordinator-center/airports/${id}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-tv-bg gap-3">
        <p className="text-sm text-tv-error">{t("coordinator.airportList.loadError")}</p>
        <button
          onClick={fetchAirports}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-tv-bg p-6" data-testid="airport-list-page">
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        <AirportSearchBar
          search={search}
          onSearchChange={setSearch}
          country={countryFilter}
          onCountryChange={setCountryFilter}
          countries={countries}
          hasAglFilter={hasAglFilter}
          onHasAglChange={setHasAglFilter}
          onAddClick={() => setShowCreateDialog(true)}
        />

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-tv-text-muted">
              {airports.length === 0
                ? t("coordinator.airportList.noAirports")
                : t("coordinator.airportList.noMatch")}
            </p>
          </div>
        ) : (
          <AirportTable airports={filtered} onRowClick={handleRowClick} />
        )}
      </div>

      <CreateAirportDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
