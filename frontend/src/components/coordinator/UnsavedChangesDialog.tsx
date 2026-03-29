import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onStay: () => void;
  onDiscard: () => void;
}

export default function UnsavedChangesDialog({
  isOpen,
  onStay,
  onDiscard,
}: UnsavedChangesDialogProps) {
  /** confirmation dialog when navigating away with unsaved changes. */
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onStay} title={t("coordinator.detail.unsavedChanges")}>
      <p className="text-sm text-tv-text-primary mb-4">
        {t("coordinator.detail.unsavedChanges")}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onStay}>
          {t("coordinator.detail.stay")}
        </Button>
        <Button variant="danger" onClick={onDiscard}>
          {t("coordinator.detail.discard")}
        </Button>
      </div>
    </Modal>
  );
}
