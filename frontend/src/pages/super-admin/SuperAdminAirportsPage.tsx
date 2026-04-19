import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Users, ExternalLink } from "lucide-react";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  SortableHeader,
} from "@/components/common/ListPageLayout";
import RowActionButtons from "@/components/common/RowActionButtons";
import ManageUsersPanel from "@/components/admin/ManageUsersPanel";
import type { AirportAdminResponse } from "@/types/admin";
import { listAirportsAdmin } from "@/api/admin";

type SortKey =
  | "icao_code"
  | "name"
  | "city"
  | "country"
  | "user_count"
  | "coordinator_count"
  | "mission_count"
  | "drone_count"
  | "terrain_source";
type SortDir = "asc" | "desc";

const TERRAIN_STYLES: Record<string, string> = {
  FLAT: "bg-tv-surface-hover text-tv-text-muted",
  DEM_UPLOAD: "bg-[var(--tv-info)]/15 text-[var(--tv-info)]",
  DEM_API: "bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]",
};

export default function SuperAdminAirportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [airports, setAirports] = useState<AirportAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [managePanel, setManagePanel] = useState<{
    airportId: string;
    airportName: string;
  } | null>(null);

  const fetchAirports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAirportsAdmin({
        search: search || undefined,
        country: countryFilter || undefined,
      });
      setAirports(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search, countryFilter]);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const countries = [...new Set(airports.map((a) => a.country).filter(Boolean))] as string[];

  const sorted = [...airports].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey as keyof AirportAdminResponse];
    const bv = b[sortKey as keyof AirportAdminResponse];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
    if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
    return 0;
  });

  return (
    <ListPageContainer data-testid="admin-airports-page">
      <ListPageContent>
        <SearchBar
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.searchAirports")}
        >
          <div className="flex items-center gap-2">
            {countries.length > 0 && (
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="rounded-full border border-tv-border bg-tv-surface px-4 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              >
                <option value="">{t("admin.columns.country")}</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        </SearchBar>

        {loading ? (
          <p className="text-center text-tv-text-muted py-8">{t("common.loading")}</p>
        ) : airports.length === 0 ? (
          <p className="text-center text-tv-text-muted py-8">{t("common.noResults")}</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full" data-testid="airports-table">
              <thead>
                <tr className="border-b border-tv-border">
                  <SortableHeader sortKey="icao_code" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.icaoCode")}
                  </SortableHeader>
                  <SortableHeader sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.name")}
                  </SortableHeader>
                  <SortableHeader sortKey="city" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.city")}
                  </SortableHeader>
                  <SortableHeader sortKey="country" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.country")}
                  </SortableHeader>
                  <SortableHeader sortKey="user_count" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.users")}
                  </SortableHeader>
                  <SortableHeader sortKey="coordinator_count" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.coordinators")}
                  </SortableHeader>
                  <SortableHeader sortKey="mission_count" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.missions")}
                  </SortableHeader>
                  <SortableHeader sortKey="drone_count" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.drones")}
                  </SortableHeader>
                  <SortableHeader sortKey="terrain_source" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.terrainSource")}
                  </SortableHeader>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((airport) => (
                  <tr
                    key={airport.id}
                    onClick={() =>
                      setManagePanel({
                        airportId: airport.id,
                        airportName: airport.name,
                      })
                    }
                    className="border-b border-tv-border hover:bg-tv-surface-hover cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-tv-text-primary">
                      {airport.icao_code}
                    </td>
                    <td className="px-4 py-3 text-sm text-tv-text-primary">{airport.name}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.city}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.country}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.user_count}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.coordinator_count}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.mission_count}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{airport.drone_count}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TERRAIN_STYLES[airport.terrain_source] || ""}`}>
                        {airport.terrain_source === "DEM_UPLOAD"
                          ? "DEM"
                          : airport.terrain_source === "DEM_API"
                            ? "API"
                            : "Flat"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RowActionButtons
                        actions={[
                          {
                            icon: Users,
                            onClick: () =>
                              setManagePanel({
                                airportId: airport.id,
                                airportName: airport.name,
                              }),
                            title: t("admin.manageUsers"),
                          },
                          {
                            icon: ExternalLink,
                            onClick: () =>
                              navigate(`/coordinator-center/airports/${airport.id}`),
                            title: t("admin.openInConfigurator"),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPageContent>

      {managePanel && (
        <ManageUsersPanel
          isOpen={true}
          onClose={() => setManagePanel(null)}
          airportId={managePanel.airportId}
          airportName={managePanel.airportName}
          onUpdated={fetchAirports}
        />
      )}
    </ListPageContainer>
  );
}
