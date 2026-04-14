import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import type { AGLResponse, AglType } from "@/types/airport";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import { compatibleMethods } from "@/utils/methodAglCompatibility";

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  templates: InspectionTemplateResponse[];
  onSelect: (templateId: string, method: InspectionMethod) => void;
  usedTemplateIds?: Set<string>;
  // optional - enables 2-step grouping by AGL type
  agls?: AGLResponse[];
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

export default function TemplatePicker({
  isOpen,
  onClose,
  templates,
  onSelect,
  usedTemplateIds,
  agls,
}: TemplatePickerProps) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<
    Record<string, InspectionMethod>
  >({});
  const [selectedAgl, setSelectedAgl] = useState<AglType | null>(null);

  // group templates by AGL type if we have airport AGLs to resolve against
  const grouped = useMemo(() => {
    if (!agls || agls.length === 0) return null;
    const byType: Record<AglType, InspectionTemplateResponse[]> = {
      PAPI: [],
      RUNWAY_EDGE_LIGHTS: [],
    };
    const ungrouped: InspectionTemplateResponse[] = [];
    for (const tpl of templates) {
      const types = templateAglTypes(tpl, agls);
      if (types.length === 0) {
        ungrouped.push(tpl);
        continue;
      }
      for (const type of types) byType[type].push(tpl);
    }
    return { byType, ungrouped };
  }, [templates, agls]);

  function compatMethods(tpl: InspectionTemplateResponse): InspectionMethod[] {
    // if we have AGL context, narrow the methods to compatible ones
    const types = agls ? templateAglTypes(tpl, agls) : [];
    if (types.length === 0) return tpl.methods;
    return compatibleMethods(tpl.methods, types);
  }

  function handleSelect(tpl: InspectionTemplateResponse) {
    const methods = compatMethods(tpl);
    const method =
      selectedMethod[tpl.id] ?? methods[0] ?? tpl.methods[0] ?? "ANGULAR_SWEEP";
    onSelect(tpl.id, method);
    onClose();
  }

  function renderTemplateRow(tpl: InspectionTemplateResponse) {
    const isUsed = usedTemplateIds?.has(tpl.id) ?? false;
    const methods = compatMethods(tpl);

    return (
      <div
        key={tpl.id}
        className="flex items-center gap-3 p-3 rounded-2xl border border-tv-border hover:bg-tv-surface-hover cursor-pointer transition-colors"
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
            className="px-2.5 py-1 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary"
            data-testid={`method-select-${tpl.id}`}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}

        {methods.length === 1 && (
          <span className="px-2.5 py-1 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary">
            {methods[0]?.replace(/_/g, " ")}
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
      onClose={onClose}
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
            {(["PAPI", "RUNWAY_EDGE_LIGHTS"] as AglType[]).map((type) => {
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
            {grouped.ungrouped.length > 0 && (
              <div className="pt-2 border-t border-tv-border space-y-2">
                <p className="text-xs font-medium text-tv-text-secondary">
                  {t("mission.config.otherTemplates")}
                </p>
                {grouped.ungrouped.map(renderTemplateRow)}
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

        {!shouldGroup && templates.map(renderTemplateRow)}
      </div>
    </Modal>
  );
}
