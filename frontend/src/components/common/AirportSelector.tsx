import { useState, useEffect, useRef } from "react";
import { useAirport } from "@/contexts/AirportContext";
import type { AirportResponse } from "@/types/airport";
import { listAirports } from "@/api/airports";

export default function AirportSelector() {
  const { selectedAirport, selectAirport } = useAirport();
  const [airports, setAirports] = useState<AirportResponse[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAirports()
      .then((res) => setAirports(res.data))
      .catch(() => {
        // backend may not be running yet
      });
  }, []);

  // close dropdown on outside click
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
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm
          bg-[var(--color-surface)] text-[var(--color-text)]
          border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
        data-testid="airport-selector"
      >
        <span className="opacity-60">Airport:</span>
        <span>{selectedAirport?.icao_code ?? "None"}</span>
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 min-w-[200px] rounded border
            border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50"
        >
          {airports.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
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
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)]
                  ${selectedAirport?.id === airport.id ? "bg-[var(--color-hover)]" : ""}`}
              >
                <span className="font-medium">{airport.icao_code}</span>
                <span className="ml-2 opacity-60">{airport.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
