import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import type { AGLResponse } from "@/types/airport";
import type { InspectionMethod } from "@/types/enums";
import { aglTypesForMethod } from "@/utils/methodAglCompatibility";
import { formatAglDisplayName } from "@/utils/agl";

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agls: AGLResponse[];
  onSubmit: (data: { name: string; aglId: string; method: InspectionMethod }) => Promise<void>;
}

// hover-point-lock is not tied to a specific AGL - operator picks the LHA per mission
const AGL_AGNOSTIC_METHODS: InspectionMethod[] = ["HOVER_POINT_LOCK"];
const ALL_METHODS: InspectionMethod[] = [
  "VERTICAL_PROFILE",
  "PAPI_HORIZONTAL_RANGE",
  "HOVER_POINT_LOCK",
  "FLY_OVER",
  "PARALLEL_SIDE_SWEEP",
];

export default function CreateTemplateDialog({
  isOpen,
  onClose,
  agls,
  onSubmit,
}: CreateTemplateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [aglId, setAglId] = useState("");
  const [method, setMethod] = useState<InspectionMethod | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const requiresAgl = method !== "" && !AGL_AGNOSTIC_METHODS.includes(method);
  const compatAglTypes = method ? aglTypesForMethod(method) : [];
  const availableAgls = method
    ? agls.filter((a) => compatAglTypes.includes(a.agl_type))
    : [];
  const selectedAgl = agls.find((a) => a.id === aglId);

  // auto-prefill name when method (and AGL, if needed) changes
  useEffect(() => {
    if (!method) return;
    const methodLabel = t(`map.inspectionMethod.${method}`);
    if (!requiresAgl) {
      setName(methodLabel);
      return;
    }
    if (!selectedAgl) return;
    const sidePart = selectedAgl.side ? ` ${selectedAgl.side}` : "";
    setName(`${selectedAgl.name}${sidePart} - ${methodLabel}`);
  }, [selectedAgl, method, requiresAgl, t]);

  function resetForm() {
    setName("");
    setAglId("");
    setMethod("");
    setErrors({});
    setApiError(null);
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = t("coordinator.inspections.nameRequired");
    if (!method) newErrors.method = t("coordinator.inspections.methodRequired");
    if (requiresAgl && !aglId) newErrors.agl = t("coordinator.inspections.aglRequired");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setApiError(null);
    try {
      await onSubmit({
        name: name.trim(),
        aglId: requiresAgl ? aglId : "",
        method: method as InspectionMethod,
      });
      resetForm();
    } catch {
      setApiError(t("coordinator.inspections.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t("coordinator.inspections.createTitle")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Input
            label={t("coordinator.inspections.templateName")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder={t("coordinator.inspections.templateNamePlaceholder")}
            data-testid="create-template-name"
          />
          {errors.name && (
            <p className="text-xs text-tv-error mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <div className="relative">
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("coordinator.inspections.selectMethod")}
            </label>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as InspectionMethod | "");
                setAglId("");
                setErrors((prev) => ({ ...prev, method: "", agl: "" }));
              }}
              className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
              data-testid="create-template-method"
            >
              <option value="">{t("coordinator.inspections.selectMethod")}</option>
              {ALL_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`map.inspectionMethod.${m}`)}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
          {errors.method && (
            <p className="text-xs text-tv-error mt-1">{errors.method}</p>
          )}
        </div>

        {requiresAgl && (
          <div>
            <div className="relative">
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.inspections.selectAgl")}
              </label>
              <select
                value={aglId}
                onChange={(e) => {
                  setAglId(e.target.value);
                  setErrors((prev) => ({ ...prev, agl: "" }));
                }}
                className="w-full px-4 py-2.5 pr-10 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
                data-testid="create-template-agl"
              >
                <option value="">{t("coordinator.inspections.selectAgl")}</option>
                {availableAgls.map((agl) => (
                  <option key={agl.id} value={agl.id}>
                    {formatAglDisplayName(agl)}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-[2.1rem] h-4 w-4 text-tv-text-secondary" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
            {errors.agl && (
              <p className="text-xs text-tv-error mt-1">{errors.agl}</p>
            )}
          </div>
        )}

        {apiError && (
          <p className="text-xs text-tv-error">{apiError}</p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" type="button" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {t("coordinator.inspections.add")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
