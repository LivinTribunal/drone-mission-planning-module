import { useState, useEffect, useRef, useCallback } from "react";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportResponse } from "@/types/airport";
import { listAirports } from "@/api/airports";

export default function AirportSelector() {
  const { selectedAirport, selectAirport } = useAirport();
  const [airports, setAirports] = useState<AirportResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAirports = useCallback(() => {
    setLoading(true);
    setError(null);
    listAirports()
      .then((res) => setAirports(res.data))
      .catch(() => setError("Failed to load airports"))
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium
          bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
        data-testid="airport-selector"
      >
        <span className="text-tv-text-secondary">Airport:</span>
        <span>{selectedAirport?.icao_code ?? "None"}</span>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
          className="absolute right-0 top-full mt-1 min-w-[220px] rounded-2xl border
            border-tv-border bg-tv-surface p-2 z-50"
        >
          {loading ? (
            <div className="px-4 py-2.5 text-sm text-tv-text-muted">
              Loading...
            </div>
          ) : error ? (
            <div className="px-4 py-2.5 text-sm text-tv-error">
              {error}
              <button
                onClick={fetchAirports}
                className="ml-2 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : airports.length === 0 ? (
            <div className="px-4 py-2.5 text-sm text-tv-text-muted">
              No airports available
            </div>
          ) : (
            airports.map((airport) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
