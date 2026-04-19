import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import type { AGLResponse } from "@/types/airport";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { InspectionMethod } from "@/types/enums";
import { METHOD_AGL_COMPAT } from "@/utils/methodAglCompatibility";
import { methodBadgeStyle } from "@/utils/inspectionMethodBadge";
import { formatAglDisplayName } from "@/utils/agl";

interface BulkCreateTemplatesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agls: AGLResponse[];
  existingTemplates: InspectionTemplateResponse[];
  onSubmit: () => Promise<void>;
}

interface Combination {
  agl: AGLResponse;
  method: InspectionMethod;
  key: string;
}

export default function BulkCreateTemplatesDialog({
  isOpen,
  onClose,
  agls,
  existingTemplates,
  onSubmit,
}: BulkCreateTemplatesDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const tpl of existingTemplates) {
      for (const method of tpl.methods) {
        for (const aglId of tpl.target_agl_ids) {
          keys.add(`${aglId}:${method}`);
        }
      }
    }
    return keys;
  }, [existingTemplates]);

  const combinations = useMemo(() => {
    const combos: Combination[] = [];
    for (const agl of agls) {
      for (const [method, compatTypes] of Object.entries(METHOD_AGL_COMPAT)) {
        if (!compatTypes.includes(agl.agl_type)) continue;
        const key = `${agl.id}:${method}`;
        if (existingKeys.has(key)) continue;
        combos.push({ agl, method: method as InspectionMethod, key });
      }
    }
    return combos;
  }, [agls, existingKeys]);

  async function handleSubmit() {
    setSubmitting(true);
    setApiError(null);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      setApiError(t("coordinator.inspections.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("coordinator.inspections.bulkCreate")}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-tv-text-secondary">
          {t("coordinator.inspections.bulkCreateDesc")}
        </p>

        {combinations.length === 0 ? (
          <p className="text-sm text-tv-text-muted py-4 text-center">
            {t("coordinator.inspections.bulkCreateNone")}
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {combinations.map((combo) => (
              <div
                key={combo.key}
                className="flex items-center justify-between p-2.5 rounded-xl border border-tv-border bg-tv-bg"
              >
                <span className="text-sm text-tv-text-primary truncate">
                  {formatAglDisplayName(combo.agl)}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ml-2"
                  style={methodBadgeStyle(combo.method)}
                >
                  {t(`map.inspectionMethodShort.${combo.method}`, combo.method)}
                </span>
              </div>
            ))}
          </div>
        )}

        {combinations.length > 0 && (
          <p className="text-xs text-tv-text-muted">
            {t("coordinator.inspections.bulkCreateCount", { count: combinations.length })}
          </p>
        )}

        {apiError && (
          <p className="text-xs text-tv-error">{apiError}</p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || combinations.length === 0}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("coordinator.inspections.bulkCreate")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
