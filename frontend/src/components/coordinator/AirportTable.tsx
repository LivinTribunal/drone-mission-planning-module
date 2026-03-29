import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AirportSummaryResponse } from "@/types/airport";

type SortKey =
  | "icao_code"
  | "name"
  | "city"
  | "country"
  | "surfaces_count"
  | "agls_count"
  | "missions_count";

type SortDir = "asc" | "desc";

interface AirportTableProps {
  airports: AirportSummaryResponse[];
  onRowClick: (id: string) => void;
}

export default function AirportTable({ airports, onRowClick }: AirportTableProps) {
  /** sortable airport table with clickable rows. */
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("icao_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    /** toggle sort direction or switch sort column. */
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    /** sort airports by current sort key and direction. */
    const arr = [...airports];
    arr.sort((a, b) => {
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
    return arr;
  }, [airports, sortKey, sortDir]);

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
    <div
      className="rounded-2xl border border-tv-border bg-tv-surface overflow-hidden"
      data-testid="airport-table"
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-tv-border">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary cursor-pointer select-none hover:text-tv-text-primary transition-colors"
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    <span className="text-tv-accent">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((airport) => (
            <tr
              key={airport.id}
              onClick={() => onRowClick(airport.id)}
              className="border-b border-tv-border last:border-b-0 cursor-pointer hover:bg-tv-surface-hover transition-colors"
              data-testid={`airport-row-${airport.id}`}
            >
              <td className="px-4 py-3 text-sm font-semibold text-tv-accent">
                {airport.icao_code}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-primary">
                {airport.name}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-secondary">
                {airport.city ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-secondary">
                {airport.country ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-secondary text-center">
                {airport.surfaces_count}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-secondary text-center">
                {airport.agls_count}
              </td>
              <td className="px-4 py-3 text-sm text-tv-text-secondary text-center">
                {airport.missions_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
