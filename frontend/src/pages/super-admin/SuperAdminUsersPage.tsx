import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

export default function SuperAdminUsersPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-tv-text-muted">
      <Users className="w-16 h-16" />
      <p className="text-lg">{t("superAdmin.usersPlaceholder")}</p>
    </div>
  );
}
