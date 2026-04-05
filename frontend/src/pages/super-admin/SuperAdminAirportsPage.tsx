import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";

export default function SuperAdminAirportsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-tv-text-muted">
      <Building2 className="w-16 h-16" />
      <p className="text-lg">{t("superAdmin.airportsPlaceholder")}</p>
    </div>
  );
}
