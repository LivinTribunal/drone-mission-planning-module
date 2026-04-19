import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import type { AGLResponse, AglType, SurfaceResponse } from "@/types/airport";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import { compatibleMethods } from "@/utils/methodAglCompatibility";
import { methodBadgeStyle } from "@/utils/inspectionMethodBadge";

const AGL_SESSION_KEY = "tarmacview_lastAglSystem";

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  templates: InspectionTemplateResponse[];
  onSelect: (templateId: string, method: InspectionMethod) => void;
  usedTemplateIds?: Set<string>;
  // optional - enables 2-step grouping by AGL type
  agls?: AGLResponse[];
  // optional - enables sorting templates by runway/surface identifier
  surfaces?: SurfaceResponse[];
}

function templateAglTypes(
  tpl: InspectionTemplateResponse,
  agls: AGLResponse[],
): AglType[] {
  const types = new Set<AglType>();
  for (const id of tpl.target_agl_ids ?? []) {
    const agl = agls.find((a) => a.id === id);
    if (agl) types.add(agl.agl_type);
  }
  return [...types];
}

// natural-order compare so "04R" < "09" < "22L"
function compareRunway(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// per-template sort key: earliest runway identifier among its target AGLs.
// templates whose AGLs don't resolve to any surface return "" and sink to the end.
function buildSortKey(
  agls: AGLResponse[],
  surfaces: SurfaceResponse[],
): (tpl: InspectionTemplateResponse) => string {
  const aglToSurfaceId = new Map<string, string>();
  for (const agl of agls) aglToSurfaceId.set(agl.id, agl.surface_id);
  const surfaceIdToIdentifier = new Map<string, string>();
  for (const s of surfaces) surfaceIdToIdentifier.set(s.id, s.identifier);
  return (tpl) => {
    const idents: string[] = [];
    for (const aglId of tpl.target_agl_ids ?? []) {
      const surfaceId = aglToSurfaceId.get(aglId);
      if (!surfaceId) continue;
      const ident = surfaceIdToIdentifier.get(surfaceId);
      if (ident) idents.push(ident);
    }
    if (idents.length === 0) return "";
    idents.sort(compareRunway);
    return idents[0];
  };
}

function sortByRunway(
  list: InspectionTemplateResponse[],
  sortKey: (tpl: InspectionTemplateResponse) => string,
): InspectionTemplateResponse[] {
  const copy = [...list];
  copy.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka === "" && kb !== "") return 1;
    if (ka !== "" && kb === "") return -1;
    const cmp = compareRunway(ka, kb);
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  return copy;
}

export default function TemplatePicker({
  isOpen,
  onClose,
  templates,
  onSelect,
  usedTemplateIds,
  agls,
  surfaces,
}: TemplatePickerProps) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<
    Record<string, InspectionMethod>
  >({});
  const [selectedAgl, setSelectedAgl] = useState<AglType | null>(null);

  // restore last-selected AGL system when the picker opens
  useEffect(() => {
    if (!isOpen) return;
    const cached = sessionStorage.getItem(AGL_SESSION_KEY);
    if (cached === "PAPI" || cached === "RUNWAY_EDGE_LIGHTS") {
      setSelectedAgl(cached);
    }
  }, [isOpen]);

  // persist AGL selection for next open
  useEffect(() => {
    if (selectedAgl) {
      sessionStorage.setItem(AGL_SESSION_KEY, selectedAgl);
    }
  }, [selectedAgl]);

  // group templates by AGL type if we have airport AGLs to resolve against.
  // hover-point-lock templates are AGL-agnostic and always land in the "special" bucket.
  // when surfaces are available, templates inside each bucket are sorted by runway
  // identifier with natural order (04R < 09 < 22L).
  const grouped = useMemo(() => {
    if (!agls || agls.length === 0) return null;
    const byType: Record<AglType, InspectionTemplateResponse[]> = {
      PAPI: [],
      RUNWAY_EDGE_LIGHTS: [],
    };
    const special: InspectionTemplateResponse[] = [];
    for (const tpl of templates) {
      const isHoverOnly =
        tpl.methods.length > 0 && tpl.methods.every((m) => m === "HOVER_POINT_LOCK");
      const types = templateAglTypes(tpl, agls);
      if (isHoverOnly || types.length === 0) {
        special.push(tpl);
        continue;
      }
      for (const type of types) byType[type].push(tpl);
    }
    if (surfaces && surfaces.length > 0) {
      const sortKey = buildSortKey(agls, surfaces);
      byType.PAPI = sortByRunway(byType.PAPI, sortKey);
      byType.RUNWAY_EDGE_LIGHTS = sortByRunway(byType.RUNWAY_EDGE_LIGHTS, sortKey);
    }
    return { byType, special };
  }, [templates, agls, surfaces]);

  // flat fallback list - sorted by runway when surfaces+agls available, by name otherwise
  const flatTemplates = useMemo(() => {
    if (surfaces && surfaces.length > 0 && agls && agls.length > 0) {
      return sortByRunway(templates, buildSortKey(agls, surfaces));
    }
    const copy = [...templates];
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return copy;
  }, [templates, agls, surfaces]);

  function compatMethods(tpl: InspectionTemplateResponse): InspectionMethod[] {
    // if we have AGL context, narrow the methods to compatible ones
    const types = agls ? templateAglTypes(tpl, agls) : [];
    if (types.length === 0) return tpl.methods;
    return compatibleMethods(tpl.methods, types);
  }

  function handleClose() {
    onClose();
  }

  function handleSelect(tpl: InspectionTemplateResponse) {
    const methods = compatMethods(tpl);
    const method =
      selectedMethod[tpl.id] ?? methods[0] ?? tpl.methods[0] ?? "HORIZONTAL_RANGE";
    onSelect(tpl.id, method);
    handleClose();
  }

  function renderTemplateRow(tpl: InspectionTemplateResponse) {
    const isUsed = usedTemplateIds?.has(tpl.id) ?? false;
    const methods = compatMethods(tpl);

    return (
      <div
        key={tpl.id}
        className="flex items-center gap-3 p-3 rounded-2xl border border-tv-border bg-tv-bg hover:bg-tv-surface-hover cursor-pointer transition-colors"
        onClick={() => handleSelect(tpl)}
        data-testid={`template-option-${tpl.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-tv-text-primary truncate">
              {tpl.name}
            </p>
            {isUsed && (
              <span className="flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-tv-accent/30 bg-tv-accent/10 text-tv-accent">
                {t("mission.config.inMission")}
              </span>
            )}
          </div>
          {tpl.description && (
            <p className="text-xs text-tv-text-muted truncate mt-0.5">
              {tpl.description}
            </p>
          )}
        </div>

        {methods.length > 1 && (
          <select
            value={selectedMethod[tpl.id] ?? methods[0]}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedMethod((prev) => ({
                ...prev,
                [tpl.id]: e.target.value as InspectionMethod,
              }));
            }}
            onClick={(e) => e.stopPropagation()}
            style={methodBadgeStyle(selectedMethod[tpl.id] ?? methods[0])}
            className="appearance-none px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none"
            data-testid={`method-select-${tpl.id}`}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {t(`map.inspectionMethodShort.${m}`, m)}
              </option>
            ))}
          </select>
        )}

        {methods.length === 1 && (
          <span
            className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
            style={methodBadgeStyle(methods[0] ?? "")}
          >
            {t(`map.inspectionMethodShort.${methods[0]}`, methods[0])}
          </span>
        )}
      </div>
    );
  }

  // render 2-step flow only when we can group by AGL and both buckets have entries
  const shouldGroup =
    grouped &&
    (grouped.byType.PAPI.length > 0 ||
      grouped.byType.RUNWAY_EDGE_LIGHTS.length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("mission.config.selectTemplate")}
    >
      <div
        className="space-y-3 max-h-80 overflow-y-auto"
        data-testid="template-picker-list"
      >
        {templates.length === 0 && (
          <p className="text-sm text-tv-text-muted py-4 text-center">
            {t("common.noResults")}
          </p>
        )}

        {shouldGroup && grouped && !selectedAgl && (
          <div className="space-y-2" data-testid="agl-type-step">
            <p className="text-xs font-medium text-tv-text-secondary">
              {t("mission.config.pickAglType")}
            </p>
            {(Object.keys(grouped.byType) as AglType[]).map((type) => {
              const count = grouped.byType[type].length;
              return (
                <button
                  key={type}
                  onClick={() => setSelectedAgl(type)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-tv-border bg-tv-bg transition-colors hover:bg-tv-surface-hover cursor-pointer"
                  data-testid={`agl-type-option-${type}`}
                >
                  <span className="text-sm font-medium text-tv-text-primary">
                    {t(`mission.config.aglType.${type}`)}
                  </span>
                  <span className="text-xs text-tv-text-muted">
                    {t("mission.config.templatesCount", { count })}
                  </span>
                </button>
              );
            })}
            {grouped.special.length > 0 && (
              <div className="pt-2 border-t border-tv-border space-y-2">
                <p className="text-xs font-medium text-tv-text-secondary">
                  {t("mission.config.specialTemplates")}
                </p>
                {grouped.special.map(renderTemplateRow)}
              </div>
            )}
          </div>
        )}

        {shouldGroup && grouped && selectedAgl && (
          <div className="space-y-2" data-testid="template-step">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-tv-text-secondary">
                {t(`mission.config.aglType.${selectedAgl}`)}
              </p>
              <button
                onClick={() => setSelectedAgl(null)}
                className="text-xs text-tv-accent hover:underline"
                data-testid="back-to-agl-step"
              >
                {t("mission.config.back")}
              </button>
            </div>
            {grouped.byType[selectedAgl].length === 0 && (
              <p
                className="text-sm text-tv-text-muted py-4 text-center"
                data-testid="no-template-for-combo"
              >
                {t("mission.config.noTemplateForCombo")}
              </p>
            )}
            {grouped.byType[selectedAgl].map(renderTemplateRow)}
          </div>
        )}

        {!shouldGroup && flatTemplates.map(renderTemplateRow)}
      </div>
    </Modal>
  );
}
