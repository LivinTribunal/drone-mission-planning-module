import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Loader2, Pencil, X, Check } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { listMissions, updateMission } from "@/api/missions";
import type { MissionResponse } from "@/types/mission";
import Badge from "@/components/common/Badge";
import type { MissionStatus } from "@/types/enums";

function formatSavedTime(date: Date): string {
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const saved = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - saved.getTime()) / 86400000);
  if (diff === 0) return `Saved today ${time}`;
  if (diff === 1) return `Saved yesterday ${time}`;
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `Saved ${dd}.${mo}. ${time}`;
}

export interface SaveContext {
  onSave: (() => void) | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
}

export interface ComputeContext {
  onCompute: (() => void) | null;
  canCompute: boolean;
  isComputing: boolean;
  label?: string;
  variant?: "primary" | "secondary";
}

export interface MissionTabOutletContext {
  setSaveContext: (ctx: SaveContext) => void;
  setComputeContext: (ctx: ComputeContext) => void;
  refreshMissions: () => void;
}

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedAirport } = useAirport();
  const [saveCtx, setSaveCtx] = useState<SaveContext>({
    onSave: null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  });
  const [computeCtx, setComputeCtx] = useState<ComputeContext>({
    onCompute: null,
    canCompute: false,
    isComputing: false,
  });
  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [missionDropdownOpen, setMissionDropdownOpen] = useState(false);

  const setSaveContext = useCallback((ctx: SaveContext) => {
    setSaveCtx(ctx);
  }, []);

  const setComputeContext = useCallback((ctx: ComputeContext) => {
    setComputeCtx(ctx);
  }, []);

  const refreshMissions = useCallback(() => {
    /** refresh the mission list for the current airport. */
    if (!selectedAirport) return;
    listMissions({ airport_id: selectedAirport.id, limit: 100 })
      .then((res) => {
        setMissions(res.data);
      })
      .catch(() => {
        // ignore
      });
  }, [selectedAirport]);

  // fetch missions for this airport
  useEffect(() => {
    refreshMissions();
  }, [refreshMissions]);

  const currentMission = missions.find((m) => m.id === id);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [missionSearch, setMissionSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const portalDropdownRef = useRef<HTMLDivElement>(null);
  const missionSearchRef = useRef<HTMLInputElement>(null);

  const filteredMissions = useMemo(() => {
    /** filter missions by search query. */
    if (!missionSearch.trim()) return missions;
    const q = missionSearch.toLowerCase();
    return missions.filter((m) => m.name.toLowerCase().includes(q));
  }, [missions, missionSearch]);

  // focus search input when dropdown opens
  useEffect(() => {
    if (missionDropdownOpen && missionSearchRef.current) {
      missionSearchRef.current.focus();
    }
  }, [missionDropdownOpen]);

  // close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      /** close mission dropdown when clicking outside selector and portal. */
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        (!portalDropdownRef.current || !portalDropdownRef.current.contains(target))
      ) {
        setMissionDropdownOpen(false);
        setMissionSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleMissionSwitch(missionId: string) {
    /** switch to a different mission. */
    setMissionDropdownOpen(false);
    setMissionSearch("");
    const path = window.location.pathname;
    const tabMatch = path.match(/\/missions\/[^/]+\/(.+)/);
    const tab = tabMatch?.[1] ?? "configuration";
    navigate(`/operator-center/missions/${missionId}/${tab}`);
  }

  function handleDeselect() {
    navigate("/operator-center/missions");
  }

  function startRename() {
    setRenaming(true);
    setRenameValue(currentMission?.name ?? "");
  }

  async function confirmRename() {
    if (!id || !renameValue.trim()) {
      setRenaming(false);
      return;
    }
    try {
      await updateMission(id, { name: renameValue.trim() });
      // refresh missions list
      if (selectedAirport) {
        const res = await listMissions({ airport_id: selectedAirport.id, limit: 100 });
        setMissions(res.data);
      }
    } catch {
      // ignore
    }
    setRenaming(false);
  }

  const tabs = [
    { label: t("mission.overviewTab"), path: "overview" },
    { label: t("mission.configuration"), path: "configuration" },
    { label: t("mission.map"), path: "map" },
    { label: t("mission.validationExport"), path: "validation-export" },
  ];

  const showSave = saveCtx.onSave !== null;
  const showCompute = computeCtx.onCompute !== null;

  return (
    <div>
      {/* mission tab bar - mirrors NavBar column widths exactly */}
      <div className="flex items-center px-4 py-2">
        {/* left section - 30%, matches NavBar left */}
        <div className="w-[30%] flex-shrink-0 flex" ref={dropdownRef}>
          <div className="flex-1 overflow-hidden" style={{ scrollbarGutter: "stable" }}>
              <div
                ref={selectorRef}
                onClick={() => { if (!renaming) setMissionDropdownOpen(!missionDropdownOpen); }}
                className="flex items-center w-full px-4 h-11 rounded-full bg-tv-surface text-tv-text-primary cursor-pointer hover:bg-tv-surface-hover transition-colors"
                data-testid="mission-selector"
              >
                <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-tv-bg border border-tv-border text-tv-text-primary mr-2">
                  {t("mission.label")}
                </span>
                {renaming ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">
                    {currentMission?.name ?? t("mission.config.selectMission")}
                  </span>
                )}

                {currentMission && !renaming && (
                  <Badge status={currentMission.status as MissionStatus} className="flex-shrink-0 ml-2" />
                )}

                {/* action buttons inside the pill */}
                <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                  {renaming ? (
                    <>
                      <button
                        onClick={confirmRename}
                        className="p-1.5 rounded-full hover:bg-tv-surface-hover transition-colors text-tv-accent"
                        title={t("common.save")}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setRenaming(false)}
                        className="p-1.5 rounded-full hover:bg-tv-surface-hover transition-colors text-tv-text-secondary"
                        title={t("common.cancel")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(); }}
                        className="p-1.5 rounded-full hover:bg-tv-surface-hover transition-colors text-tv-text-primary"
                        title={t("common.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeselect(); }}
                        className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary transition-colors"
                        title={t("common.close")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMissionDropdownOpen(!missionDropdownOpen); }}
                        className="p-1.5 rounded-full hover:bg-tv-surface-hover transition-colors text-tv-text-primary"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${missionDropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </>
                  )}
                </div>
              </div>

          </div>

            {/* dropdown via portal to avoid overflow-hidden clipping */}
            {missionDropdownOpen && missions.length > 0 && selectorRef.current && createPortal(
              <div
                ref={portalDropdownRef}
                className="fixed z-50 bg-tv-surface border-2 border-tv-text-muted rounded-2xl p-2"
                style={{
                  top: selectorRef.current.getBoundingClientRect().bottom + 4,
                  left: selectorRef.current.getBoundingClientRect().left,
                  width: selectorRef.current.getBoundingClientRect().width,
                }}
              >
                <input
                  ref={missionSearchRef}
                  value={missionSearch}
                  onChange={(e) => setMissionSearch(e.target.value)}
                  placeholder={t("mission.config.searchMissions")}
                  className="w-full rounded-full px-4 py-2 text-sm bg-tv-bg border border-tv-border text-tv-text-primary placeholder:text-tv-text-muted outline-none focus:border-tv-accent mb-2"
                />
                <div className="max-h-48 overflow-y-auto">
                  {filteredMissions.length === 0 ? (
                    <div className="px-4 py-2.5 text-sm text-tv-text-muted">
                      {t("common.noResults")}
                    </div>
                  ) : (
                    filteredMissions.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleMissionSwitch(m.id)}
                        className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-sm transition-colors ${
                          m.id === id
                            ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                            : "text-tv-text-primary hover:bg-tv-surface-hover"
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        <Badge
                          status={m.status as MissionStatus}
                          className="ml-2 flex-shrink-0"
                        />
                      </button>
                    ))
                  )}
                </div>
              </div>,
              document.body,
            )}
          <div className="w-6 flex-shrink-0" />
        </div>

        {/* right section - flex-1, mirrors NavBar right */}
        <div className="flex-1 flex items-center gap-4 min-w-0">
          {/* tab pills - flex-1, matches main nav pills */}
          <div
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-tv-surface p-1 h-11"
            data-testid="mission-tabs"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/operator-center/missions/${id}/${tab.path}`}
                className={({ isActive }) =>
                  `px-5 h-9 rounded-full text-sm font-medium transition-colors flex items-center ${
                    isActive
                      ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                      : "text-tv-text-primary hover:bg-tv-surface-hover"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>

          {/* compute / action button - matches airport selector width */}
          {showCompute && (
            <button
              onClick={() => computeCtx.onCompute?.()}
              disabled={!computeCtx.canCompute || computeCtx.isComputing}
              title={
                !computeCtx.canCompute && !computeCtx.isComputing
                  ? t("mission.config.recomputeTooltip")
                  : undefined
              }
              className={`flex items-center justify-center gap-2 min-w-[280px] h-11 rounded-full text-sm font-semibold transition-colors ${
                computeCtx.variant === "secondary"
                  ? "border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover"
                  : computeCtx.isComputing
                    ? "bg-tv-accent/50 text-tv-accent-text cursor-not-allowed"
                    : !computeCtx.canCompute
                      ? "bg-tv-surface text-tv-text-muted opacity-50 cursor-not-allowed"
                      : "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover"
              }`}
              data-testid="compute-trajectory-btn"
            >
              {computeCtx.isComputing && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {computeCtx.isComputing
                ? t("mission.config.computing")
                : computeCtx.label ?? t("mission.config.computeTrajectory")}
            </button>
          )}

          {/* save button - same width as theme toggle (81px) */}
          {showSave && (
            <button
              onClick={() => saveCtx.onSave?.()}
              disabled={!saveCtx.isDirty || saveCtx.isSaving}
              className={`rounded-full px-4 h-11 min-w-[81px] text-sm font-semibold transition-colors border ${
                saveCtx.isDirty && !saveCtx.isSaving
                  ? "border-tv-accent bg-tv-surface text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
                  : "border-tv-border bg-tv-surface text-tv-text-muted cursor-not-allowed"
              }`}
              data-testid="save-button"
            >
              {saveCtx.isSaving
                ? t("mission.config.saving")
                : t("mission.config.save")}
            </button>
          )}

          {/* last saved timestamp - same width as user dropdown */}
          <div className="w-[140px] flex-shrink-0">
            <span className="flex items-center justify-center rounded-full px-4 h-11 text-xs text-tv-text-muted whitespace-nowrap">
              {saveCtx.lastSaved
                ? formatSavedTime(saveCtx.lastSaved)
                : t("mission.config.notSavedYet")}
            </span>
          </div>
        </div>
      </div>

      <div className="py-2">
        <Outlet
          context={
            { setSaveContext, setComputeContext, refreshMissions } satisfies MissionTabOutletContext
          }
        />
      </div>
    </div>
  );
}
