import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, X, Pencil, Copy, Trash2, Plus } from "lucide-react";
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
import CollapsibleSection from "@/components/common/CollapsibleSection";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import AirportMap from "@/components/map/AirportMap";
import TerrainToggle from "@/components/map/overlays/TerrainToggle";
import TemplateConfigSection from "@/components/mission/TemplateConfigSection";
import TemplateSelectorDropdown from "@/components/mission/TemplateSelectorDropdown";
import CreateTemplateDialog from "@/components/mission/CreateTemplateDialog";

export default function InspectionEditPage() {
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
  const [editMethod, setEditMethod] = useState<InspectionMethod>("ANGULAR_SWEEP");
  const [selectedAglId, setSelectedAglId] = useState<string>("");
  const [selectedLhaIds, setSelectedLhaIds] = useState<Set<string>>(new Set());
  const [editName, setEditName] = useState("");
  const [isRenamingName, setIsRenamingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // map
  const [terrainMode, setTerrainMode] = useState<"map" | "satellite">("satellite");

  // all agls from airport
  const allAgls = useMemo(() => {
    if (!airportDetail) return [];
    return airportDetail.surfaces.flatMap((s) => s.agls);
  }, [airportDetail]);

  function showNotif(msg: string) {
    setNotification(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  const fetchData = useCallback(async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coordinator.inspections.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, airportDetail, t]);

  function initializeFromTemplate(tpl: InspectionTemplateResponse) {
    const cfg = tpl.default_config;
    setEditConfig(
      cfg
        ? {
            altitude_offset: cfg.altitude_offset,
            speed_override: cfg.speed_override,
            measurement_density: cfg.measurement_density,
            custom_tolerances: cfg.custom_tolerances,
            density: cfg.density,
            hover_duration: cfg.hover_duration,
            horizontal_distance: cfg.horizontal_distance,
            sweep_angle: cfg.sweep_angle,
            lha_ids: cfg.lha_ids,
          }
        : {
            altitude_offset: null,
            speed_override: null,
            measurement_density: null,
            custom_tolerances: null,
            density: null,
            hover_duration: null,
            horizontal_distance: null,
            sweep_angle: null,
            lha_ids: null,
          },
    );

    setEditMethod((tpl.methods[0] ?? "ANGULAR_SWEEP") as InspectionMethod);
    setEditName(tpl.name);

    const aglId = tpl.target_agl_ids[0] ?? "";
    setSelectedAglId(aglId);

    // initialize lha selection from config or all lhas
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else if (aglId) {
      const agl = allAgls.find((a) => a.id === aglId);
      if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }

    setIsDirty(false);
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
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else {
      setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }
  }, [allAgls, template]);

  function markDirty() {
    setIsDirty(true);
  }

  function handleConfigChange(field: string, value: number | null) {
    markDirty();
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
  }

  function handleMethodChange(method: InspectionMethod) {
    markDirty();
    setEditMethod(method);
  }

  function handleAglChange(aglId: string) {
    markDirty();
    setSelectedAglId(aglId);
    if (aglId) {
      const agl = allAgls.find((a) => a.id === aglId);
      if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    } else {
      setSelectedLhaIds(new Set());
    }
  }

  function handleToggleLha(lhaId: string) {
    markDirty();
    setSelectedLhaIds((prev) => {
      const next = new Set(prev);
      if (next.has(lhaId)) next.delete(lhaId);
      else next.add(lhaId);
      return next;
    });
  }

  function handleSelectAllLhas() {
    markDirty();
    const agl = allAgls.find((a) => a.id === selectedAglId);
    if (agl) setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
  }

  function handleDeselectAllLhas() {
    markDirty();
    setSelectedLhaIds(new Set());
  }

  async function handleSave() {
    if (!id || !template) return;
    setSaving(true);
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
      setIsDirty(false);
      setIsRenamingName(false);
      showNotif(t("coordinator.inspections.saved"));
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
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
    try {
      const result = await createInspectionTemplate({
        name: data.name,
        target_agl_ids: [data.aglId],
        methods: [data.method],
      });
      setShowCreate(false);
      navigate(`/coordinator-center/inspections/${result.id}`);
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.createError"));
    }
  }

  function formatTimestamp(dateStr: string | null): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  }

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
    <div className="flex px-4 h-[calc(100vh-12rem)]" data-testid="inspection-edit-page">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ scrollbarGutter: "stable" }}>
          {/* selected inspection container */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <CollapsibleSection title={t("coordinator.inspections.title")}>
              <div className="mb-2">
                <TemplateSelectorDropdown
                  templates={allTemplates}
                  currentId={template.id}
                  onSelect={(tid) => navigate(`/coordinator-center/inspections/${tid}`)}
                />
              </div>
            </CollapsibleSection>

            {/* selected template info */}
            <div className="mt-3 border-t border-tv-border pt-3">
              <div className="flex items-center gap-2 mb-1">
                {isRenamingName ? (
                  <input
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); markDirty(); }}
                    onBlur={() => setIsRenamingName(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") setIsRenamingName(false); }}
                    className="flex-1 text-sm font-semibold text-tv-text-primary bg-transparent border-b border-tv-accent focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <h2 className="flex-1 text-sm font-semibold text-tv-text-primary truncate">
                    {editName || template.name}
                  </h2>
                )}
                <button
                  onClick={() => setIsRenamingName(true)}
                  className="rounded-full p-1 text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
                  aria-label="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => navigate("/coordinator-center/inspections")}
                  className="rounded-full p-1 text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
                  aria-label={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tv-status-draft-bg)] text-[var(--tv-status-draft-text)]">
                  {editMethod === "ANGULAR_SWEEP"
                    ? t("coordinator.inspections.angularSweep")
                    : t("coordinator.inspections.verticalProfile")}
                </span>
                <span className="text-xs text-tv-text-secondary">
                  {t("coordinator.inspections.usedInMissions", { count: template.mission_count ?? 0 })}
                </span>
              </div>

              <p className="text-xs text-tv-text-muted">
                {t("coordinator.inspections.lastUpdated")}: {formatTimestamp(template.updated_at ?? template.created_at)}
              </p>

              {/* action buttons */}
              <div className="flex gap-2 mt-3">
                <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  {t("coordinator.inspections.addNew")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDuplicate}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t("coordinator.inspections.duplicateTemplate")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowDelete(true)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("coordinator.inspections.deleteTemplate")}
                </Button>
              </div>
            </div>
          </div>

          {/* configuration form - always editable */}
          <CollapsibleSection title={t("coordinator.inspections.configuration")}>
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
          </CollapsibleSection>

          {/* save button */}
          <div className="px-1">
            <Button onClick={handleSave} disabled={saving || !isDirty} className="w-full">
              {t("coordinator.inspections.save")}
            </Button>
          </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* right panel - map */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {airportDetail ? (
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-tv-border">
            <AirportMap
              airport={airportDetail}
              terrainMode={terrainMode}
              onTerrainChange={setTerrainMode}
              showTerrainToggle={false}
            />

            {/* bottom bar */}
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between">
              <TerrainToggle mode={terrainMode} onToggle={setTerrainMode} inline />
              <button
                onClick={() => navigate(`/operator-center/missions`)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
              >
                {t("coordinator.inspections.openMap")}
              </button>
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
