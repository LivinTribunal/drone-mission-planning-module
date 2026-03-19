import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { AirportResponse, AirportDetailResponse } from "@/types/airport";
import { getAirport } from "@/api/airports";

const AIRPORT_KEY = "tarmacview_airport";

interface AirportContextValue {
  selectedAirport: AirportResponse | null;
  airportDetail: AirportDetailResponse | null;
  airportDetailLoading: boolean;
  selectAirport: (airport: AirportResponse) => void;
  clearAirport: () => void;
  refreshAirportDetail: () => void;
}

const AirportContext = createContext<AirportContextValue | null>(null);

export function AirportProvider({ children }: { children: ReactNode }) {
  const [selectedAirport, setSelectedAirport] =
    useState<AirportResponse | null>(null);
  const [airportDetail, setAirportDetail] =
    useState<AirportDetailResponse | null>(null);
  const [airportDetailLoading, setAirportDetailLoading] = useState(false);

  const fetchDetail = useCallback((airportId: string) => {
    setAirportDetailLoading(true);
    getAirport(airportId)
      .then((detail) => setAirportDetail(detail))
      .catch(() => setAirportDetail(null))
      .finally(() => setAirportDetailLoading(false));
  }, []);

  // rehydrate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(AIRPORT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          parsed?.id &&
          parsed?.icao_code &&
          parsed?.name &&
          parsed?.elevation != null
        ) {
          setSelectedAirport(parsed as AirportResponse);
          fetchDetail(parsed.id);
        } else {
          localStorage.removeItem(AIRPORT_KEY);
        }
      } catch {
        localStorage.removeItem(AIRPORT_KEY);
      }
    }
  }, [fetchDetail]);

  const selectAirport = useCallback(
    (airport: AirportResponse) => {
      localStorage.setItem(AIRPORT_KEY, JSON.stringify(airport));
      setSelectedAirport(airport);
      setAirportDetail(null);
      fetchDetail(airport.id);
    },
    [fetchDetail],
  );

  const clearAirport = useCallback(() => {
    localStorage.removeItem(AIRPORT_KEY);
    setSelectedAirport(null);
    setAirportDetail(null);
  }, []);

  const refreshAirportDetail = useCallback(() => {
    if (selectedAirport) {
      fetchDetail(selectedAirport.id);
    }
  }, [selectedAirport, fetchDetail]);

  return (
    <AirportContext.Provider
      value={{
        selectedAirport,
        airportDetail,
        airportDetailLoading,
        selectAirport,
        clearAirport,
        refreshAirportDetail,
      }}
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
