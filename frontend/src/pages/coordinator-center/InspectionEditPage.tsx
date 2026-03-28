import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, X, Pencil, Copy, Trash2 } from "lucide-react";
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
import TemplateAglSection from "@/components/mission/TemplateAglSection";
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

  // edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editConfig, setEditConfig] = useState<Omit<InspectionConfigResponse, "id"> | null>(null);
  const [selectedLhaIds, setSelectedLhaIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
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

  // target agl for this template
  const targetAgl = useMemo(() => {
    if (!template) return null;
    return allAgls.find((a) => a.id === template.target_agl_ids[0]) ?? null;
  }, [template, allAgls]);

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

      // initialize config from template defaults
      initializeFromTemplate(tpl);
    } catch {
      setError(t("coordinator.inspections.loadError"));
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

    // initialize lha selection from config or all lhas
    const agl = allAgls.find((a) => a.id === tpl.target_agl_ids[0]);
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else if (agl) {
      setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // re-init lha selection when allAgls or template change (airport detail loaded later)
  useEffect(() => {
    if (!template || allAgls.length === 0) return;
    const agl = allAgls.find((a) => a.id === template.target_agl_ids[0]);
    if (!agl) return;

    const cfg = template.default_config;
    if (cfg?.lha_ids && cfg.lha_ids.length > 0) {
      setSelectedLhaIds(new Set(cfg.lha_ids.map(String)));
    } else {
      setSelectedLhaIds(new Set(agl.lhas.map((l) => l.id)));
    }
  }, [allAgls, template]);

  function handleConfigChange(field: string, value: number | null) {
    setEditConfig((prev) => {
      if (!prev) return prev;
      if (field === "custom_tolerances") {
        return {
          ...prev,
          custom_tolerances: value !== null ? { default: value } : null,
        };
      }
      return { ...prev, [field]: value };
    });
  }

  function handleToggleLha(lhaId: string) {
    setSelectedLhaIds((prev) => {
      const next = new Set(prev);
      if (next.has(lhaId)) next.delete(lhaId);
      else next.add(lhaId);
      return next;
    });
  }

  async function handleSave() {
    if (!id || !template) return;
    setSaving(true);
    try {
      const configPayload = editConfig
        ? { ...editConfig, lha_ids: Array.from(selectedLhaIds) }
        : undefined;

      const result = await updateInspectionTemplate(id, {
        default_config: configPayload,
      });
      setTemplate(result);
      setIsEditing(false);
      showNotif(t("coordinator.inspections.saved"));
    } catch {
      showNotif(t("coordinator.inspections.saveError"));
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
    } catch {
      showNotif(t("coordinator.inspections.duplicateError"));
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteInspectionTemplate(id);
      navigate("/coordinator-center/inspections");
    } catch {
      showNotif(t("coordinator.inspections.deleteError"));
    }
    setShowDelete(false);
  }

  async function handleCreate(data: { name: string; aglId: string; method: InspectionMethod }) {
    const result = await createInspectionTemplate({
      name: data.name,
      target_agl_ids: [data.aglId],
      methods: [data.method],
    });
    setShowCreate(false);
    navigate(`/coordinator-center/inspections/${result.id}`);
  }

  function formatTimestamp(dateStr: string | null) {
    if (!dateStr) return "";
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

  const method = template.methods[0] ?? "";

  return (
    <div className="flex px-4 h-[calc(100vh-12rem)]" data-testid="inspection-edit-page">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ scrollbarGutter: "stable" }}>
          {/* template header */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="flex-1 text-base font-semibold text-tv-text-primary truncate">
                {template.name}
              </h2>
              <button
                onClick={() => navigate("/coordinator-center/inspections")}
                className="rounded-full p-1 text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <TemplateSelectorDropdown
                templates={allTemplates}
                currentId={template.id}
                onSelect={(tid) => navigate(`/coordinator-center/inspections/${tid}`)}
              />
            </div>

            <p className="text-xs text-tv-text-muted">
              {t("coordinator.inspections.lastUpdated")}: {formatTimestamp(template.updated_at ?? template.created_at)}
            </p>

            <div className="mt-3">
              <Button onClick={() => setShowCreate(true)} className="text-xs">
                {t("coordinator.inspections.addNew")}
              </Button>
            </div>
          </div>

          {/* agl section */}
          <CollapsibleSection title={t("coordinator.inspections.aglSection")} count={targetAgl?.lhas.length}>
            <TemplateAglSection
              agl={targetAgl}
              selectedLhaIds={selectedLhaIds}
              onToggleLha={handleToggleLha}
              onSelectAll={() => {
                if (targetAgl) setSelectedLhaIds(new Set(targetAgl.lhas.map((l) => l.id)));
              }}
              onDeselectAll={() => setSelectedLhaIds(new Set())}
              isEditing={isEditing}
            />
          </CollapsibleSection>

          {/* config section */}
          <CollapsibleSection title={t("coordinator.inspections.configuration")}>
            <TemplateConfigSection
              config={editConfig}
              method={method}
              isEditing={isEditing}
              onChange={handleConfigChange}
            />
          </CollapsibleSection>

          {/* action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={isEditing ? "primary" : "secondary"}
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("coordinator.inspections.editTemplate")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDuplicate}
              className="flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              {t("coordinator.inspections.duplicateTemplate")}
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("coordinator.inspections.deleteTemplate")}
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
              <Button onClick={handleSave} disabled={saving || !isEditing}>
                {t("coordinator.inspections.save")}
              </Button>
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
