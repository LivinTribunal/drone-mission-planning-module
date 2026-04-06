import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";

export default function SuperAdminSystemPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-tv-text-muted">
      <Settings className="w-16 h-16" />
      <p className="text-lg">{t("superAdmin.systemPlaceholder")}</p>
    </div>
  );
}
