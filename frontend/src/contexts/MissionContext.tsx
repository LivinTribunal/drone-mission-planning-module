import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAirport } from "./AirportContext";
import { listMissions, getMission } from "@/api/missions";
import type { MissionResponse, MissionDetailResponse } from "@/types/mission";

const MISSION_KEY = "tarmacview_mission";

interface MissionContextValue {
  missions: MissionResponse[];
  missionsLoading: boolean;
  selectedMission: MissionDetailResponse | null;
  refreshMissions: () => Promise<void>;
  refreshSelectedMission: () => Promise<void>;
  updateMissionInList: (updated: MissionResponse) => void;
  setSelectedMission: (mission: MissionDetailResponse | null) => void;
  clearMission: () => void;
}

const MissionContext = createContext<MissionContextValue | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  /** provider for centralized mission state with persistence and airport-change handling. */
  const { selectedAirport } = useAirport();
  const navigate = useNavigate();
  const location = useLocation();

  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [selectedMission, setSelectedMissionState] =
    useState<MissionDetailResponse | null>(null);

  const prevAirportIdRef = useRef<string | undefined>(selectedAirport?.id);
  const initialMountRef = useRef(true);

  // persist selected mission id to localStorage
  const setSelectedMission = useCallback(
    (mission: MissionDetailResponse | null) => {
      setSelectedMissionState(mission);
      if (mission) {
        localStorage.setItem(MISSION_KEY, mission.id);
      } else {
        localStorage.removeItem(MISSION_KEY);
      }
    },
    [],
  );

  const clearMission = useCallback(() => {
    setSelectedMissionState(null);
    localStorage.removeItem(MISSION_KEY);
  }, []);

  // fetch missions for the current airport
  const refreshMissions = useCallback(async () => {
    if (!selectedAirport) {
      setMissions([]);
      return;
    }
    setMissionsLoading(true);
    try {
      const res = await listMissions({
        airport_id: selectedAirport.id,
        limit: 100,
      });
      setMissions(res.data);
    } catch {
      // ignore - keep stale list
    } finally {
      setMissionsLoading(false);
    }
  }, [selectedAirport]);

  // re-fetch the selected mission detail from server
  const refreshSelectedMission = useCallback(async () => {
    if (!selectedMission) return;
    try {
      const fresh = await getMission(selectedMission.id);
      setSelectedMissionState(fresh);
    } catch {
      // ignore
    }
  }, [selectedMission]);

  // optimistically update a mission in the list without full refetch
  const updateMissionInList = useCallback((updated: MissionResponse) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
    );
    // also update selectedMission status if it matches
    setSelectedMissionState((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      return { ...prev, ...updated };
    });
  }, []);

  // fetch missions when airport changes
  useEffect(() => {
    refreshMissions();
  }, [refreshMissions]);

  // FIX 10: when airport changes (not initial mount), clear mission and redirect
  useEffect(() => {
    const prevId = prevAirportIdRef.current;
    const newId = selectedAirport?.id;
    prevAirportIdRef.current = newId;

    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    if (prevId && prevId !== newId) {
      clearMission();
      if (location.pathname.includes("/missions/")) {
        navigate("/operator-center/dashboard", { replace: true });
      }
    }
  }, [selectedAirport?.id, clearMission, location.pathname, navigate]);

  // FIX 3: rehydrate selected mission from localStorage on mount
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (rehydratedRef.current || !selectedAirport) return;
    const savedId = localStorage.getItem(MISSION_KEY);
    if (!savedId) return;
    rehydratedRef.current = true;

    getMission(savedId)
      .then((mission) => {
        if (mission.airport_id === selectedAirport.id) {
          setSelectedMissionState(mission);
        } else {
          localStorage.removeItem(MISSION_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(MISSION_KEY);
      });
  }, [selectedAirport]);

  return (
    <MissionContext.Provider
      value={{
        missions,
        missionsLoading,
        selectedMission,
        refreshMissions,
        refreshSelectedMission,
        updateMissionInList,
        setSelectedMission,
        clearMission,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}

export function useMission(): MissionContextValue {
  /** access mission context - must be used within MissionProvider. */
  const ctx = useContext(MissionContext);
  if (!ctx) {
    throw new Error("useMission must be used within MissionProvider");
  }
  return ctx;
}
