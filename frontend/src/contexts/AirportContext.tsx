import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { AirportResponse } from "@/types/airport";

const AIRPORT_KEY = "tarmacview_airport";

interface AirportContextValue {
  selectedAirport: AirportResponse | null;
  selectAirport: (airport: AirportResponse) => void;
  clearAirport: () => void;
}

const AirportContext = createContext<AirportContextValue | null>(null);

export function AirportProvider({ children }: { children: ReactNode }) {
  const [selectedAirport, setSelectedAirport] =
    useState<AirportResponse | null>(null);

  // rehydrate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(AIRPORT_KEY);
    if (saved) {
      try {
        setSelectedAirport(JSON.parse(saved));
      } catch {
        localStorage.removeItem(AIRPORT_KEY);
      }
    }
  }, []);

  const selectAirport = useCallback((airport: AirportResponse) => {
    localStorage.setItem(AIRPORT_KEY, JSON.stringify(airport));
    setSelectedAirport(airport);
  }, []);

  const clearAirport = useCallback(() => {
    localStorage.removeItem(AIRPORT_KEY);
    setSelectedAirport(null);
  }, []);

  return (
    <AirportContext.Provider
      value={{ selectedAirport, selectAirport, clearAirport }}
    >
      {children}
    </AirportContext.Provider>
  );
}

export function useAirport(): AirportContextValue {
  const ctx = useContext(AirportContext);
  if (!ctx) {
    throw new Error("useAirport must be used within AirportProvider");
  }
  return ctx;
}
