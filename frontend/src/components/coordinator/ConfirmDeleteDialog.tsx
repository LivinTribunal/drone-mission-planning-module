import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteDialog({
  isOpen,
  name,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  /** confirmation dialog for delete operations. */
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t("coordinator.detail.confirmDelete")}>
      <p className="text-sm text-tv-text-primary mb-4">
        {t("coordinator.detail.deleteConfirm", { name })}
      </p>
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
