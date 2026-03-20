import { useState, useCallback, useEffect } from "react";
import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { listMissions } from "@/api/missions";
import type { MissionResponse } from "@/types/mission";

export interface SaveContext {
  onSave: (() => void) | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
}

export interface MissionTabOutletContext {
  setSaveContext: (ctx: SaveContext) => void;
}

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();
  const [saveCtx, setSaveCtx] = useState<SaveContext>({
    onSave: null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  });
  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [missionDropdownOpen, setMissionDropdownOpen] = useState(false);

  const setSaveContext = useCallback((ctx: SaveContext) => {
    setSaveCtx(ctx);
  }, []);

  // fetch missions for this airport
  useEffect(() => {
    if (!airportDetail) return;
    listMissions({ airport_id: airportDetail.id, limit: 100 }).then((res) => {
      setMissions(res.data);
    }).catch(() => {
      // ignore
    });
  }, [airportDetail]);

  const currentMission = missions.find((m) => m.id === id);

  function handleMissionSwitch(missionId: string) {
    setMissionDropdownOpen(false);
    // preserve current tab
    const path = window.location.pathname;
    const tabMatch = path.match(/\/missions\/[^/]+\/(.+)/);
    const tab = tabMatch?.[1] ?? "configuration";
    navigate(`/operator-center/missions/${missionId}/${tab}`);
  }

  const tabs = [
    { label: t("mission.overview"), path: "overview" },
    { label: t("mission.configuration"), path: "configuration" },
    { label: t("mission.map"), path: "map" },
    { label: t("mission.validationExport"), path: "validation-export" },
  ];

  const showSave = saveCtx.onSave !== null;

  return (
    <div>
      <div className="mx-4 mt-4 space-y-2">
        {/* mission selector */}
        <div className="relative">
          <button
            onClick={() => setMissionDropdownOpen(!missionDropdownOpen)}
            className="flex items-center justify-between w-full px-4 py-2.5 rounded-full text-sm font-medium bg-tv-surface border border-tv-border text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
            data-testid="mission-selector"
          >
            <span className="truncate">
              {currentMission?.name ?? t("mission.config.selectMission")}
            </span>
            <ChevronDown className="h-4 w-4 flex-shrink-0 ml-2" />
          </button>
          {missionDropdownOpen && missions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-tv-surface border border-tv-border rounded-2xl p-2 max-h-60 overflow-y-auto">
              {missions.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleMissionSwitch(m.id)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${
                    m.id === id
                      ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                      : "text-tv-text-primary hover:bg-tv-surface-hover"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* tab navigation + save button */}
        <div className="flex items-center gap-2">
          <div
            className="flex gap-1 flex-1 px-4 py-2 bg-tv-surface rounded-full p-1"
            data-testid="mission-tabs"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/operator-center/missions/${id}/${tab.path}`}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                      : "text-tv-text-secondary hover:bg-tv-surface-hover"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>

          {showSave && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => saveCtx.onSave?.()}
                disabled={!saveCtx.isDirty || saveCtx.isSaving}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border ${
                  saveCtx.isDirty && !saveCtx.isSaving
                    ? "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
                    : "border-tv-border text-tv-text-muted opacity-50 cursor-not-allowed"
                }`}
                data-testid="save-button"
              >
                {saveCtx.isSaving
                  ? t("mission.config.saving")
                  : t("mission.config.save")}
              </button>
              {saveCtx.lastSaved && (
                <span className="text-xs text-tv-text-muted whitespace-nowrap">
                  {t("mission.config.saved")} {saveCtx.lastSaved}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        <Outlet context={{ setSaveContext } satisfies MissionTabOutletContext} />
      </div>
    </div>
  );
}
