import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import type { AGLResponse } from "@/types/airport";
import type { InspectionMethod } from "@/types/enums";

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agls: AGLResponse[];
  onSubmit: (data: { name: string; aglId: string; method: InspectionMethod }) => Promise<void>;
}

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
    if (!aglId) newErrors.agl = t("coordinator.inspections.aglRequired");
    if (!method) newErrors.method = t("coordinator.inspections.methodRequired");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setApiError(null);
    try {
      await onSubmit({ name: name.trim(), aglId, method: method as InspectionMethod });
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
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("coordinator.inspections.selectAgl")}
          </label>
          <select
            value={aglId}
            onChange={(e) => {
              setAglId(e.target.value);
              setErrors((prev) => ({ ...prev, agl: "" }));
            }}
            className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
            data-testid="create-template-agl"
          >
            <option value="">{t("coordinator.inspections.selectAgl")}</option>
            {agls.map((agl) => (
              <option key={agl.id} value={agl.id}>
                {agl.name} - {agl.agl_type}{agl.side ? ` - ${agl.side}` : ""}
              </option>
            ))}
          </select>
          {errors.agl && (
            <p className="text-xs text-tv-error mt-1">{errors.agl}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("coordinator.inspections.selectMethod")}
          </label>
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as InspectionMethod | "");
              setErrors((prev) => ({ ...prev, method: "" }));
            }}
            className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
            data-testid="create-template-method"
          >
            <option value="">{t("coordinator.inspections.selectMethod")}</option>
            <option value="ANGULAR_SWEEP">{t("coordinator.inspections.angularSweep")}</option>
            <option value="VERTICAL_PROFILE">{t("coordinator.inspections.verticalProfile")}</option>
          </select>
          {errors.method && (
            <p className="text-xs text-tv-error mt-1">{errors.method}</p>
          )}
        </div>

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
