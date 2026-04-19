import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { AirportResponse, AirportDetailResponse } from "@/types/airport";
import { getAirport } from "@/api/airports";

const AIRPORT_KEY = "tarmacview_airport";

interface AirportContextValue {
  selectedAirport: AirportResponse | null;
  airportDetail: AirportDetailResponse | null;
  airportDetailLoading: boolean;
  airportDetailError: boolean;
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
  const [airportDetailError, setAirportDetailError] = useState(false);
  const fetchCounterRef = useRef(0);

  const fetchDetail = useCallback((airportId: string) => {
    const requestId = ++fetchCounterRef.current;
    setAirportDetailLoading(true);
    setAirportDetailError(false);
    getAirport(airportId)
      .then((detail) => {
        if (fetchCounterRef.current !== requestId) return;
        setAirportDetail(detail);
        setSelectedAirport((prev) => {
          if (!prev || prev.id !== detail.id) return prev;
          if (prev.default_drone_profile_id === detail.default_drone_profile_id) return prev;
          return { ...prev, default_drone_profile_id: detail.default_drone_profile_id };
        });
        setAirportDetailError(false);
      })
      .catch(() => {
        if (fetchCounterRef.current !== requestId) return;
        setAirportDetail(null);
        setAirportDetailError(true);
      })
      .finally(() => {
        if (fetchCounterRef.current !== requestId) return;
        setAirportDetailLoading(false);
      });
  }, []);

  // persist selected airport to localStorage
  useEffect(() => {
    if (selectedAirport) {
      localStorage.setItem(AIRPORT_KEY, JSON.stringify(selectedAirport));
    }
  }, [selectedAirport]);

  // rehydrate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(AIRPORT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed?.id === "string" &&
          typeof parsed?.icao_code === "string" &&
          typeof parsed?.name === "string" &&
          typeof parsed?.elevation === "number" &&
          parsed.location &&
          typeof parsed.location === "object" &&
          Array.isArray(parsed.location.coordinates) &&
          parsed.location.coordinates.length >= 2
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
      setAirportDetailError(false);
      fetchDetail(airport.id);
    },
    [fetchDetail],
  );

  const clearAirport = useCallback(() => {
    localStorage.removeItem(AIRPORT_KEY);
    setSelectedAirport(null);
    setAirportDetail(null);
    setAirportDetailError(false);
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
        airportDetailError,
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
