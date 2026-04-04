import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportResponse } from "@/types/airport";
import { listAirports } from "@/api/airports";

export default function AirportSelector() {
  /** airport selector dropdown with search. */
  const { selectedAirport, selectAirport, clearAirport } = useAirport();
  const { t } = useTranslation();
  const [airports, setAirports] = useState<AirportResponse[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchAirports = useCallback(() => {
    /** fetch all airports. */
    setLoading(true);
    setError(false);
    listAirports()
      .then((res) => setAirports(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      /** close dropdown on outside click. */
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    /** filter airports by search query. */
    if (!search.trim()) return airports;
    const q = search.toLowerCase();
    return airports.filter(
      (a) =>
        a.icao_code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    );
  }, [airports, search]);

  return (
    <div ref={ref} className="relative w-[280px] flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-full px-4 h-11 text-sm font-medium
          bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
        data-testid="airport-selector"
      >
        <span className="flex-1 text-left truncate">
          {selectedAirport
            ? `${selectedAirport.icao_code} \u2013 ${selectedAirport.name}`
            : t("nav.chooseAirport")}
        </span>
        {selectedAirport && (
          <span
            className="flex items-center justify-center min-w-[1.5rem] h-6 rounded-full px-1.5 text-xs font-semibold text-tv-accent-text flex-shrink-0"
            style={{ backgroundColor: "rgba(59, 187, 59, 0.75)" }}
          >
            {selectedAirport.icao_code}
          </span>
        )}
        {selectedAirport && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAirport();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearAirport(); }
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full
              bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary transition-colors cursor-pointer"
            aria-label="Clear airport"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
        <svg
          className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-full rounded-2xl border-2
            border-tv-text-muted bg-tv-surface p-2 z-50"
        >
          {/* search bar */}
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("nav.searchAirports")}
            className="w-full rounded-full px-4 py-2 text-sm bg-tv-bg border border-tv-border text-tv-text-primary placeholder:text-tv-text-muted outline-none focus:border-tv-accent mb-2"
          />

          {loading ? (
            <div className="px-4 py-2.5 text-sm text-tv-text-muted">
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="px-4 py-2.5 text-sm text-tv-error">
              {t("airportSelection.loadError")}
              <button
                onClick={fetchAirports}
                className="ml-2 underline hover:no-underline"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-2.5 text-sm text-tv-text-muted">
              {search.trim()
                ? t("common.noResults")
                : t("airportSelection.noAirports")}
            </div>
          ) : (
            <div className="max-h-[225px] overflow-y-auto">
              {filtered.map((airport) => (
                <button
                  key={airport.id}
                  onClick={() => {
                    selectAirport(airport);
                    setOpen(false);
                  }}
                  className={`flex items-center w-full text-left rounded-xl px-4 py-2.5 text-sm transition-colors ${
                    selectedAirport?.id === airport.id
                      ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                      : "text-tv-text-primary hover:bg-tv-surface-hover"
                  }`}
                >
                  <span className="font-medium">
                    {airport.icao_code}
                  </span>
                  <span className="ml-2 truncate">
                    {airport.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
