import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Plus, X, Upload, ChevronDown, Search } from "lucide-react";
import { useMission } from "@/contexts/MissionContext";
import { updateMission } from "@/api/missions";
import type { MissionResponse, MissionDetailResponse } from "@/types/mission";
import Badge from "@/components/common/Badge";
import DetailSelector from "@/components/common/DetailSelector";
import DetailSelectorItem from "@/components/common/DetailSelectorItem";
import type { MissionStatus } from "@/types/enums";

function formatSavedTime(date: Date, t: (key: string, opts?: Record<string, string>) => string): string {
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const saved = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - saved.getTime()) / 86400000);
  if (diff === 0) return t("mission.config.savedToday", { time });
  if (diff === 1) return t("mission.config.savedYesterday", { time });
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return t("mission.config.savedOn", { date: `${dd}.${mo}.`, time });
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
  tooltip?: string;
  variant?: "primary" | "secondary";
  icon?: "upload";
}

export interface MissionTabOutletContext {
  setSaveContext: (ctx: SaveContext) => void;
  setComputeContext: (ctx: ComputeContext) => void;
  refreshMissions: () => Promise<void>;
  mission: MissionDetailResponse | null;
  updateMissionFromPage: (m: MissionResponse) => void;
  leftPanelEl: HTMLDivElement | null;
  setCompactLeftPanel: (compact: boolean) => void;
}

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    missions,
    selectedMission,
    refreshMissions,
    updateMissionInList,
  } = useMission();

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
  const [missionDropdownOpen, setMissionDropdownOpen] = useState(false);
  const [missionSearch, setMissionSearch] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // compact pill selector refs + portal position
  const compactSelectorRef = useRef<HTMLDivElement>(null);
  const compactDropdownRef = useRef<HTMLDivElement>(null);
  const [compactDropdownPos, setCompactDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // portal target for page left panel content
  const [leftPanelEl, setLeftPanelEl] = useState<HTMLDivElement | null>(null);
  const [compactLeftPanel, setCompactLeftPanelState] = useState(false);

  const setCompactLeftPanel = useCallback((compact: boolean) => {
    setCompactLeftPanelState(compact);
  }, []);

  const setSaveContext = useCallback((ctx: SaveContext) => {
    setSaveCtx(ctx);
  }, []);

  const setComputeContext = useCallback((ctx: ComputeContext) => {
    setComputeCtx(ctx);
  }, []);

  // update mission in context when a page pushes a status change
  const updateMissionFromPage = useCallback(
    (updated: MissionResponse) => {
      updateMissionInList(updated);
    },
    [updateMissionInList],
  );

  const currentMission = missions.find((m) => m.id === id);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const filteredMissions = useMemo(() => {
    /** filter missions by search query. */
    if (!missionSearch.trim()) return missions;
    const q = missionSearch.toLowerCase();
    return missions.filter((m) => m.name.toLowerCase().includes(q));
  }, [missions, missionSearch]);

  // close compact dropdown on outside click
  useEffect(() => {
    if (!compactLeftPanel || !missionDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      /** close compact dropdown on outside click. */
      const target = e.target as Node;
      if (compactSelectorRef.current?.contains(target)) return;
      if (compactDropdownRef.current?.contains(target)) return;
      setMissionDropdownOpen(false);
      setMissionSearch("");
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [compactLeftPanel, missionDropdownOpen]);

  /** toggle the mission selector dropdown. */
  const handleSelectorToggle = useCallback(() => {
    setMissionDropdownOpen((prev) => {
      if (prev) setMissionSearch("");
      return !prev;
    });
  }, []);

  function handleMissionSwitch(missionId: string) {
    /** switch to a different mission. */
    setMissionDropdownOpen(false);
    setMissionSearch("");
    const tabMatch = location.pathname.match(/\/missions\/[^/]+\/(.+)/);
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
      await refreshMissions();
    } catch (e) {
      console.error("rename failed", e instanceof Error ? e.message : String(e));
      setRenameError(t("mission.renameError"));
      if (renameErrorTimer.current) clearTimeout(renameErrorTimer.current);
      renameErrorTimer.current = setTimeout(() => setRenameError(null), 4000);
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

  const missionSelectorBlock = (
    <DetailSelector
      title={t("mission.label")}
      count={missions.length}
      actions={[
        { icon: Plus, onClick: () => navigate("/operator-center/missions"), title: t("mission.createNew"), variant: "accent" },
        { icon: Pencil, onClick: startRename, title: t("common.edit") },
        { icon: X, onClick: handleDeselect, title: t("common.close") },
      ]}
      renderSelected={() => (
        <>
          <span className="flex-1 min-w-0 truncate text-sm font-medium text-tv-text-primary">
            {currentMission?.name ?? t("mission.config.selectMission")}
          </span>
          {currentMission && (
            <Badge status={currentMission.status as MissionStatus} className="flex-shrink-0" />
          )}
        </>
      )}
      isOpen={missionDropdownOpen}
      onToggle={handleSelectorToggle}
      isRenaming={renaming}
      renameValue={renameValue}
      onRenameChange={setRenameValue}
      onRenameFinish={confirmRename}
      searchValue={missionSearch}
      onSearchChange={setMissionSearch}
      searchPlaceholder={t("mission.config.searchMissions")}
      noResultsText={t("common.noResults")}
      usePortal
      renderDropdownItems={() =>
        filteredMissions.length === 0 ? null : filteredMissions.map((m) => (
          <DetailSelectorItem
            key={m.id}
            isSelected={m.id === id}
            onClick={() => handleMissionSwitch(m.id)}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm">{m.name}</span>
              <Badge
                status={m.status as MissionStatus}
                className="ml-2 flex-shrink-0"
              />
            </div>
          </DetailSelectorItem>
        ))
      }
    />
  );

  const outletContext = {
    setSaveContext,
    setComputeContext,
    refreshMissions,
    mission: selectedMission,
    updateMissionFromPage,
    leftPanelEl,
    setCompactLeftPanel,
  } satisfies MissionTabOutletContext;

  const tabsRow = (
    <div className="flex-1 flex items-center gap-4 min-w-0">
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

      {showCompute && (
        <button
          onClick={() => computeCtx.onCompute?.()}
          disabled={!computeCtx.canCompute || computeCtx.isComputing}
          title={!computeCtx.canCompute && !computeCtx.isComputing ? (computeCtx.tooltip ?? t("mission.config.recomputeTooltip")) : undefined}
          className={`flex items-center justify-center gap-2 w-[280px] flex-shrink-0 h-11 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
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
          {computeCtx.isComputing && <Loader2 className="h-4 w-4 animate-spin" />}
          {!computeCtx.isComputing && computeCtx.icon === "upload" && <Upload className="h-4 w-4" />}
          {computeCtx.isComputing ? t("mission.config.computing") : computeCtx.label ?? t("mission.config.computeTrajectory")}
        </button>
      )}

      {showSave && (
        <button
          onClick={() => saveCtx.onSave?.()}
          disabled={!saveCtx.isDirty || saveCtx.isSaving}
          className={`rounded-full px-4 h-11 min-w-[81px] flex-shrink-0 text-sm font-semibold transition-colors border ${
            saveCtx.isDirty && !saveCtx.isSaving
              ? "border-tv-accent bg-tv-surface text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
              : "border-tv-border bg-tv-surface text-tv-text-muted cursor-not-allowed"
          }`}
          data-testid="save-button"
        >
          {saveCtx.isSaving ? t("mission.config.saving") : t("mission.config.save")}
        </button>
      )}

      <div className="w-[140px] flex-shrink-0">
        <span className="flex items-center justify-center rounded-full px-4 h-11 text-xs text-tv-text-muted whitespace-nowrap">
          {saveCtx.lastSaved ? formatSavedTime(saveCtx.lastSaved, t) : t("mission.config.notSavedYet")}
        </span>
      </div>
    </div>
  );

  // compact mode: stacked layout - full-width tab bar row above full-width content (like original main)
  if (compactLeftPanel) {
    return (
      <div className="flex flex-col h-[calc(100vh-5.25rem)]">
        {/* full-width tab bar row */}
        <div className="flex items-center px-4 py-2 flex-shrink-0">
          {/* pill selector - 30% */}
          <div className="w-[30%] flex-shrink-0 flex">
            <div className="flex-1 overflow-hidden" style={{ scrollbarGutter: "stable" }}>
              <div
                ref={compactSelectorRef}
                onClick={() => {
                  if (!renaming) {
                    setMissionDropdownOpen(!missionDropdownOpen);
                    if (!missionDropdownOpen && compactSelectorRef.current) {
                      const rect = compactSelectorRef.current.getBoundingClientRect();
                      setCompactDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                    }
                  }
                }}
                className="flex items-center w-full px-4 h-11 rounded-full bg-tv-surface text-tv-text-primary cursor-pointer hover:bg-tv-surface-hover transition-colors"
                data-testid="mission-selector"
              >
                <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-tv-bg border border-tv-border text-tv-text-primary mr-2">
                  {t("mission.label")}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-medium">
                  {currentMission?.name ?? t("mission.config.selectMission")}
                </span>
                {currentMission && (
                  <Badge status={currentMission.status as MissionStatus} className="flex-shrink-0 ml-2" />
                )}
                <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handleDeselect(); }} className="flex items-center justify-center h-5 w-5 rounded-full bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary transition-colors" title={t("common.close")}><X className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setMissionDropdownOpen(!missionDropdownOpen); if (!missionDropdownOpen && compactSelectorRef.current) { const rect = compactSelectorRef.current.getBoundingClientRect(); setCompactDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width }); } }} className="p-1.5 rounded-full hover:bg-tv-surface-hover transition-colors text-tv-text-primary"><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${missionDropdownOpen ? "rotate-180" : ""}`} /></button>
                </div>
              </div>
            </div>

            {/* compact dropdown via portal */}
            {missionDropdownOpen && compactDropdownPos && createPortal(
              <div
                ref={compactDropdownRef}
                className="fixed z-50 rounded-2xl border border-tv-border bg-tv-surface"
                style={{ top: compactDropdownPos.top, left: compactDropdownPos.left, width: compactDropdownPos.width }}
              >
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tv-text-muted" />
                    <input
                      value={missionSearch}
                      onChange={(e) => setMissionSearch(e.target.value)}
                      placeholder={t("mission.config.searchMissions")}
                      className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredMissions.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-tv-text-muted text-center">{t("common.noResults")}</p>
                  ) : (
                    filteredMissions.map((m) => (
                      <DetailSelectorItem
                        key={m.id}
                        isSelected={m.id === id}
                        onClick={() => handleMissionSwitch(m.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm">{m.name}</span>
                          <Badge status={m.status as MissionStatus} className="ml-2 flex-shrink-0" />
                        </div>
                      </DetailSelectorItem>
                    ))
                  )}
                </div>
              </div>,
              document.body,
            )}
            <div className="w-6 flex-shrink-0" />
          </div>

          {/* tabs + buttons */}
          {tabsRow}
        </div>

        {renameError && (
          <div className="mx-4 mb-2 rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-2 text-sm text-red-400">
            {renameError}
          </div>
        )}

        {/* full-width content */}
        <div className="flex-1 min-h-0 pb-2">
          <Outlet context={outletContext} />
        </div>
      </div>
    );
  }

  // normal mode: two-column layout
  return (
    <div className="flex h-[calc(100vh-5.25rem)] px-4 pt-2">
      {/* LEFT COLUMN */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 flex flex-col overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
          <div className="flex-shrink-0">
            {missionSelectorBlock}
          </div>

          {renameError && (
            <div className="mt-2 rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-2 text-sm text-red-400">
              {renameError}
            </div>
          )}

          <div
            ref={setLeftPanelEl}
            className="flex flex-col gap-4 pt-4 pb-2"
          />
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* RIGHT COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 pb-2">
        <div className="flex items-center gap-4 flex-shrink-0 pb-3">
          {tabsRow}
        </div>

        <div className="flex-1 min-h-0">
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
  );
}
