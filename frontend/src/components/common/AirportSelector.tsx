import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportResponse } from "@/types/airport";
import { listAirports } from "@/api/airports";

export default function AirportSelector() {
  const { selectedAirport, selectAirport, clearAirport } = useAirport();
  const { t } = useTranslation();
  const [airports, setAirports] = useState<AirportResponse[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAirports = useCallback(() => {
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative min-w-[280px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-full px-4 h-11 text-sm font-medium
          bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
        data-testid="airport-selector"
      >
        <span className="flex-1 text-left truncate">
          {selectedAirport
            ? `${selectedAirport.icao_code} - ${selectedAirport.name}`
            : t("nav.chooseAirport")}
        </span>
        {selectedAirport && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearAirport();
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full
              bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary transition-colors"
            aria-label="Clear airport"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
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
          className="absolute right-0 top-full mt-1 w-full rounded-2xl border
            border-tv-border bg-tv-surface p-2 z-50"
        >
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
          ) : airports.length === 0 ? (
            <div className="px-4 py-2.5 text-sm text-tv-text-muted">
              {t("airportSelection.noAirports")}
            </div>
          ) : (
            <div className="max-h-[225px] overflow-y-auto">
              {airports.map((airport) => (
                <button
                  key={airport.id}
                  onClick={() => {
                    selectAirport(airport);
                    setOpen(false);
                  }}
                  className={`block w-full text-left rounded-xl px-4 py-2.5 text-sm transition-colors
                    ${selectedAirport?.id === airport.id ? "bg-tv-surface-hover" : "hover:bg-tv-surface-hover"}`}
                >
                  <span className="font-medium text-tv-text-primary">
                    {airport.icao_code}
                  </span>
                  <span className="ml-2 text-tv-text-secondary">
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
