import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  name: string;
  warnings?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteDialog({
  isOpen,
  name,
  warnings,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  /** confirmation dialog for delete operations with optional dependency warnings. */
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t("coordinator.detail.confirmDelete")}>
      <p className="text-sm text-tv-text-primary mb-4">
        {t("coordinator.detail.deleteConfirm", { name })}
      </p>
      {warnings && warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-tv-warning bg-tv-warning-bg px-3 py-2">
          <p className="text-xs font-semibold text-tv-warning mb-1">
            {t("coordinator.detail.deleteWarningTitle")}
          </p>
          <ul className="list-disc list-inside text-xs text-tv-text-secondary">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" onClick={onConfirm} data-testid="confirm-delete-button">
          {t("common.delete")}
        </Button>
      </div>
    </Modal>
  );
}
