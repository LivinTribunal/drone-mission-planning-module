import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, X, Pencil, Copy, Trash2, Plus, Link } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import {
  getInspectionTemplate,
  listInspectionTemplates,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  createInspectionTemplate,
} from "@/api/inspectionTemplates";
import type { InspectionTemplateResponse, InspectionConfigResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import TemplateConfigSection from "@/components/mission/TemplateConfigSection";
import DetailSelector from "@/components/common/DetailSelector";
import DetailSelectorItem from "@/components/common/DetailSelectorItem";
import CreateTemplateDialog from "@/components/mission/CreateTemplateDialog";
import { methodBadgeStyle } from "@/utils/inspectionMethodBadge";

const AUTOSAVE_DELAY = 1200;

/** format a date as a human-readable saved timestamp. */
function formatTimestamp(
  date: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t("coordinator.inspections.savedJustNow");
  if (diffMin < 60)
    return t("coordinator.inspections.savedMinutesAgo", { count: diffMin });

  return t("coordinator.inspections.savedAt", {
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
}

export default function InspectionEditPage() {
  /**inspection template editor with autosave.*/
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();

  const [template, setTemplate] = useState<InspectionTemplateResponse | null>(null);
  const [allTemplates, setAllTemplates] = useState<InspectionTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // config edit state
  const [editConfig, setEditConfig] = useState<Omit<InspectionConfigResponse, "id"> | null>(null);
  const [editMethod, setEditMethod] = useState<InspectionMethod>("PAPI_HORIZONTAL_RANGE");
  const [selectedAglId, setSelectedAglId] = useState<string>("");
  const [selectedLhaIds, setSelectedLhaIds] = useState<Set<string>>(new Set());
  const [editName, setEditName] = useState("");
  const [isRenamingName, setIsRenamingName] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // autosave state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performSaveRef = useRef<(() => Promise<void>) | null>(null);

  // tick for relative timestamp display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // ui
  const [configExpanded, setConfigExpanded] = useState(true);

  // dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // selector dropdown
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorSearch, setSelectorSearch] = useState("");

  // map
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");

  // all agls from airport
  const allAgls = useMemo(() => {
    if (!airportDetail) return [];
    return airportDetail.surfaces.flatMap((s) => s.agls);
  }, [airportDetail]);

  function showNotif(msg: string) {
    /**show a temporary notification toast.*/
    setNotification(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const fetchData = useCallback(async () => {
    /**fetch template and all templates list.*/
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [tpl, allTpl] = await Promise.all([
        getInspectionTemplate(id),
        listInspectionTemplates(
          airportDetail ? { airport_id: airportDetail.id } : undefined,
        ),
      ]);
      setTemplate(tpl);
      setAllTemplates(allTpl.data);
      initializeFromTemplate(tpl);

      // initialize last saved from db timestamp
      if (tpl.updated_at) {
        setLastSaved(new Date(tpl.updated_at));
      } else if (tpl.created_at) {
        setLastSaved(new Date(tpl.created_at));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coordinator.inspections.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, airportDetail, t]);

  function initializeFromTemplate(tpl: InspectionTemplateResponse) {
    /**initialize edit state from a template.*/
    const cfg = tpl.default_config;
    setEditConfig(
      cfg
        ? {
            altitude_offset: cfg.altitude_offset,
            measurement_speed_override: cfg.measurement_speed_override,
            measurement_density: cfg.measurement_density,
            custom_tolerances: cfg.custom_tolerances,
            hover_duration: cfg.hover_duration,
            horizontal_distance: cfg.horizontal_distance,
            sweep_angle: cfg.sweep_angle,
            vertical_profile_height: cfg.vertical_profile_height,
            lha_ids: cfg.lha_ids,
            capture_mode: cfg.capture_mode,
            recording_setup_duration: cfg.recording_setup_duration,
            buffer_distance: cfg.buffer_distance,
            height_above_lights: cfg.height_above_lights,
            lateral_offset: cfg.lateral_offset,
            distance_from_lha: cfg.distance_from_lha,
            height_above_lha: cfg.height_above_lha,
            camera_gimbal_angle: cfg.camera_gimbal_angle,
            selected_lha_id: cfg.selected_lha_id,
            hover_bearing: cfg.hover_bearing,
            hover_bearing_reference: cfg.hover_bearing_reference,
            white_balance: cfg.white_balance,
            iso: cfg.iso,
            shutter_speed: cfg.shutter_speed,
            focus_mode: cfg.focus_mode,
            focus_distance_m: cfg.focus_distance_m,
            optical_zoom: cfg.optical_zoom,
          }
        : {
            altitude_offset: null,
            measurement_speed_override: null,
            measurement_density: null,
            custom_tolerances: null,
            hover_duration: null,
            horizontal_distance: null,
            sweep_angle: null,
            vertical_profile_height: null,
            lha_ids: null,
            capture_mode: null,
            recording_setup_duration: null,
            buffer_distance: null,
            height_above_lights: null,
            lateral_offset: null,
            distance_from_lha: null,
            height_above_lha: null,
            camera_gimbal_angle: null,
            selected_lha_id: null,
            hover_bearing: null,
            hover_bearing_reference: null,
            white_balance: null,
            iso: null,
            shutter_speed: null,
            focus_mode: null,
            focus_distance_m: null,
            optical_zoom: null,
          },
    );

    setEditMethod((tpl.methods[0] ?? "PAPI_HORIZONTAL_RANGE") as InspectionMethod);
    setEditName(tpl.name);

    const aglId = tpl.target_agl_ids[0] ?? "";
    setSelectedAglId(aglId);

    // initialize lha selection from config or all lhas.
    // hover-point-lock templates don't pin specific LHAs - the operator picks
    // one at mission time - so leave the set empty here.
    const method = (tpl.methods[0] ?? "PAPI_HORIZONTAL_RANGE") as InspectionMethod;
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else if (aglId && method !== "HOVER_POINT_LOCK") {
      const agl = allAgls.find((a) => a.id === aglId);
      if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // re-init lha selection when allAgls load after template
  useEffect(() => {
    if (!template || allAgls.length === 0) return;
    const aglId = template.target_agl_ids[0] ?? "";
    if (!aglId) return;

    const agl = allAgls.find((a) => a.id === aglId);
    if (!agl) return;

    const cfg = template.default_config;
    const method = (template.methods[0] ?? "PAPI_HORIZONTAL_RANGE") as InspectionMethod;
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else if (method !== "HOVER_POINT_LOCK") {
      setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }
  }, [allAgls, template]);

  // autosave
  const performSave = useCallback(async () => {
    /**persist current edit state to the backend.*/
    if (!id || !template) return;
    setSaving(true);
    setSaveError(false);
    try {
      const configPayload = editConfig
        ? { ...editConfig, lha_ids: Array.from(selectedLhaIds) }
        : undefined;

      const result = await updateInspectionTemplate(id, {
        name: editName !== template.name ? editName : undefined,
        methods: [editMethod],
        target_agl_ids: selectedAglId ? [selectedAglId] : undefined,
        default_config: configPayload,
      });
      setTemplate(result);
      setLastSaved(new Date());
      setSaveError(false);
    } catch (err) {
      console.error("autosave failed:", err instanceof Error ? err.message : String(err));
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [id, template, editConfig, editMethod, selectedAglId, selectedLhaIds, editName]);

  // keep ref current so scheduled autosave always calls latest performSave
  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  function scheduleAutosave() {
    /**schedule an autosave after debounce delay.*/
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      performSaveRef.current?.();
    }, AUTOSAVE_DELAY);
  }

  function handleConfigChange(field: string, value: number | null) {
    /**handle a config field change and schedule autosave.*/
    setEditConfig((prev) => {
      if (!prev) return prev;
      if (field === "custom_tolerances") {
        if (value === null) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { default: _, ...rest } = prev.custom_tolerances ?? {};
          return {
            ...prev,
            custom_tolerances: Object.keys(rest).length > 0 ? rest : null,
          };
        }
        return {
          ...prev,
          custom_tolerances: { ...(prev.custom_tolerances ?? {}), default: value },
        };
      }
      return { ...prev, [field]: value };
    });
    scheduleAutosave();
  }

  function handleMethodChange(method: InspectionMethod) {
    /**handle method change and schedule autosave.*/
    setEditMethod(method);
    scheduleAutosave();
  }

  function handleAglChange(aglId: string) {
    /**handle agl change and schedule autosave.*/
    setSelectedAglId(aglId);
    if (aglId) {
      // hover point lock picks a single LHA per mission, so leave the
      // template's LHA list empty on AGL change; other methods pre-select all.
      if (editMethod === "HOVER_POINT_LOCK") {
        setSelectedLhaIds(new Set());
      } else {
        const agl = allAgls.find((a) => a.id === aglId);
        if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
      }
    } else {
      setSelectedLhaIds(new Set());
    }
    scheduleAutosave();
  }

  function handleToggleLha(lhaId: string) {
    /**toggle a single lha unit and schedule autosave.*/
    setSelectedLhaIds((prev) => {
      const next = new Set(prev);
      if (next.has(lhaId)) next.delete(lhaId);
      else next.add(lhaId);
      return next;
    });
    scheduleAutosave();
  }

  function handleSelectAllLhas() {
    /**select all lha units and schedule autosave.*/
    const agl = allAgls.find((a) => a.id === selectedAglId);
    if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    scheduleAutosave();
  }

  function handleDeselectAllLhas() {
    /**deselect all lha units and schedule autosave.*/
    setSelectedLhaIds(new Set());
    scheduleAutosave();
  }

  function handleNameChange(name: string) {
    /**handle name edit and schedule autosave.*/
    setEditName(name);
    scheduleAutosave();
  }

  function handleRenameFinish() {
    /**finish inline rename.*/
    setIsRenamingName(false);
  }

  async function handleDuplicate() {
    /**duplicate the current template.*/
    if (!template) return;
    try {
      const result = await createInspectionTemplate({
        name: `${template.name} (Copy)`,
        target_agl_ids: template.target_agl_ids,
        methods: template.methods,
        default_config: editConfig ?? undefined,
      });
      navigate(`/coordinator-center/inspections/${result.id}`);
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.duplicateError"));
    }
  }

  async function handleDelete() {
    /**delete the current template.*/
    if (!id) return;
    try {
      await deleteInspectionTemplate(id);
      setShowDelete(false);
      navigate("/coordinator-center/inspections");
    } catch (err) {
      setShowDelete(false);
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.deleteError"));
    }
  }

  async function handleCreate(data: { name: string; aglId: string; method: InspectionMethod }) {
    /**create a new template.*/
    try {
      const result = await createInspectionTemplate({
        name: data.name,
        target_agl_ids: data.aglId ? [data.aglId] : [],
        methods: [data.method],
      });
      setShowCreate(false);
      navigate(`/coordinator-center/inspections/${result.id}`);
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.createError"));
    }
  }

  /** format inspection method for display. */
  function formatMethod(method: string) {
    return t(`map.inspectionMethodShort.${method}`, method);
  }

  const filteredTemplates = selectorSearch
    ? allTemplates.filter((tpl) => tpl.name.toLowerCase().includes(selectorSearch.toLowerCase()))
    : allTemplates;

  const handleSelectorToggle = useCallback(() => {
    /** toggle template selector dropdown. */
    setSelectorOpen((prev) => {
      if (prev) setSelectorSearch("");
      return !prev;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-tv-error">{error ?? t("common.error")}</p>
        <Button onClick={fetchData}>{t("common.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex px-4 h-[calc(100vh-7rem)]" data-testid="inspection-edit-page">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4" style={{ scrollbarGutter: "stable" }}>
          {/* template selector */}
          <DetailSelector
            title={t("coordinator.inspections.title")}
            count={allTemplates.length}
            actions={[
              { icon: Plus, onClick: () => setShowCreate(true), title: t("coordinator.inspections.addNew"), variant: "accent" },
              { icon: Copy, onClick: handleDuplicate, title: t("coordinator.inspections.duplicateTemplate") },
              { icon: Pencil, onClick: () => setIsRenamingName(true), title: t("coordinator.inspections.rename") },
              { icon: Trash2, onClick: () => setShowDelete(true), title: t("coordinator.inspections.deleteTemplate"), variant: "danger" },
              { icon: X, onClick: () => navigate("/coordinator-center/inspections"), title: t("common.close") },
            ]}
            renderSelected={() => (
              <>
                <span className="flex-1 text-tv-text-primary truncate font-medium">
                  {editName || template.name}
                </span>
                {(template.mission_count ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-tv-text-secondary" title={t("coordinator.inspections.usedInMissions", { count: template.mission_count ?? 0 })}>
                    <Link className="h-3 w-3" />
                    <span className="text-xs font-medium">{template.mission_count}</span>
                  </span>
                )}
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs"
                  style={methodBadgeStyle(template.methods[0] ?? "")}
                >
                  {formatMethod(template.methods[0] ?? "")}
                </span>
              </>
            )}
            isOpen={selectorOpen}
            onToggle={handleSelectorToggle}
            isRenaming={isRenamingName}
            renameValue={editName}
            onRenameChange={handleNameChange}
            onRenameFinish={handleRenameFinish}
            searchValue={selectorSearch}
            onSearchChange={setSelectorSearch}
            searchPlaceholder={t("coordinator.inspections.searchPlaceholder")}
            noResultsText={t("coordinator.inspections.noMatch")}
            renderDropdownItems={() =>
              filteredTemplates.length === 0 ? null : filteredTemplates.map((tpl) => (
                <DetailSelectorItem
                  key={tpl.id}
                  isSelected={tpl.id === template.id}
                  onClick={() => { navigate(`/coordinator-center/inspections/${tpl.id}`); handleSelectorToggle(); }}
                  disabled={tpl.id === template.id}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate flex-1 ${tpl.id === template.id ? "font-medium" : "text-tv-text-primary"}`}>
                      {tpl.name}
                    </span>
                    {(tpl.mission_count ?? 0) > 0 && (
                      <span className={`flex items-center gap-0.5 ${tpl.id === template.id ? "text-tv-accent-text/70" : "text-tv-text-secondary"}`}>
                        <Link className="h-3 w-3" />
                        <span className="text-xs font-medium">{tpl.mission_count}</span>
                      </span>
                    )}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${tpl.id === template.id ? "bg-tv-accent-text/20 text-tv-accent-text" : ""}`}
                      style={tpl.id === template.id ? {} : methodBadgeStyle(tpl.methods[0] ?? "")}
                    >
                      {formatMethod(tpl.methods[0] ?? "")}
                    </span>
                  </div>
                </DetailSelectorItem>
              ))
            }
          />

          {/* configuration form - collapsible container */}
          <div className="bg-tv-surface border border-tv-border rounded-3xl">
            <button
              onClick={() => setConfigExpanded(!configExpanded)}
              className="flex w-full items-center gap-2 p-4 text-left"
            >
              <span className="text-base font-semibold text-tv-text-primary rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
                {t("coordinator.inspections.configuration")}
              </span>
              <span className="flex-1" />
              {/* autosave status */}
              <span className="flex items-center gap-1.5 text-xs text-tv-text-muted" onClick={(e) => e.stopPropagation()}>
                {saving && (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("coordinator.inspections.saving")}
                  </>
                )}
                {!saving && saveError && (
                  <span className="text-tv-error">
                    {t("coordinator.inspections.saveError")}
                  </span>
                )}
                {!saving && !saveError && lastSaved && (
                  <>
                    <svg className="h-3 w-3 text-tv-success" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {formatTimestamp(lastSaved, t)}
                  </>
                )}
              </span>
              <svg
                className={`h-5 w-5 flex-shrink-0 text-tv-text-secondary transition-transform duration-200 ${
                  configExpanded ? "rotate-180" : ""
                }`}
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
            {configExpanded && (
              <>
                <div className="border-b border-tv-border" />
                <div className="px-4 py-4">
                  <TemplateConfigSection
                    config={editConfig}
                    method={editMethod}
                    onChange={handleConfigChange}
                    onMethodChange={handleMethodChange}
                    allAgls={allAgls}
                    selectedAglId={selectedAglId}
                    onAglChange={handleAglChange}
                    selectedLhaIds={selectedLhaIds}
                    onToggleLha={handleToggleLha}
                    onSelectAllLhas={handleSelectAllLhas}
                    onDeselectAllLhas={handleDeselectAllLhas}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* right panel - map */}
      <div className="flex-1 flex flex-col min-w-0 pb-4">
        {airportDetail ? (
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-tv-border">
            <AirportMap
              airport={airportDetail}
              helpVariant="preview"
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              showTerrainToggle={false}
            />

            {/* bottom right - terrain toggle */}
            <div className="absolute bottom-3 right-3 z-10">
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-tv-surface rounded-2xl border border-tv-border">
            <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
          </div>
        )}
      </div>

      {/* create dialog */}
      <CreateTemplateDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        agls={allAgls}
        onSubmit={handleCreate}
      />

      {/* delete confirmation */}
      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title={t("coordinator.inspections.deleteTemplate")}
      >
        <p className="text-sm text-tv-text-secondary mb-4">
          {t("coordinator.inspections.deleteConfirm", { name: template.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowDelete(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </Modal>

      {/* notification toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-tv-surface border border-tv-border text-sm text-tv-text-primary">
          {notification}
        </div>
      )}
    </div>
  );
}
