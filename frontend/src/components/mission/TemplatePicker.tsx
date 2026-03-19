import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  templates: InspectionTemplateResponse[];
  onSelect: (templateId: string, method: InspectionMethod) => void;
}

export default function TemplatePicker({
  isOpen,
  onClose,
  templates,
  onSelect,
}: TemplatePickerProps) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<
    Record<string, InspectionMethod>
  >({});

  function handleSelect(template: InspectionTemplateResponse) {
    const method =
      selectedMethod[template.id] ?? template.methods[0] ?? "ANGULAR_SWEEP";
    onSelect(template.id, method);
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("mission.config.selectTemplate")}
    >
      <div className="space-y-2 max-h-80 overflow-y-auto" data-testid="template-picker-list">
        {templates.length === 0 && (
          <p className="text-sm text-tv-text-muted py-4 text-center">
            {t("common.noResults")}
          </p>
        )}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex items-center gap-3 p-3 rounded-2xl border border-tv-border hover:bg-tv-surface-hover cursor-pointer transition-colors"
            onClick={() => handleSelect(tpl)}
            data-testid={`template-option-${tpl.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-tv-text-primary truncate">
                {tpl.name}
              </p>
              {tpl.description && (
                <p className="text-xs text-tv-text-muted truncate mt-0.5">
                  {tpl.description}
                </p>
              )}
            </div>

            {tpl.methods.length > 1 && (
              <select
                value={selectedMethod[tpl.id] ?? tpl.methods[0]}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedMethod((prev) => ({
                    ...prev,
                    [tpl.id]: e.target.value as InspectionMethod,
                  }));
                }}
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-1 rounded-full text-xs border border-tv-border bg-tv-bg text-tv-text-primary"
                data-testid={`method-select-${tpl.id}`}
              >
                {tpl.methods.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            )}

            {tpl.methods.length === 1 && (
              <span className="px-2 py-1 rounded-full text-xs bg-tv-surface text-tv-text-secondary">
                {tpl.methods[0]?.replace("_", " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
