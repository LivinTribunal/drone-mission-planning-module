import { useTranslation } from "react-i18next";

export default function InspectionListPage() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center h-full bg-tv-bg">
      <p className="text-sm text-tv-text-muted">{t("coordinator.inspectionTemplates")}</p>
    </div>
  );
}
