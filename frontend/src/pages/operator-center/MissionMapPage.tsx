import { useTranslation } from "react-i18next";

export default function MissionMapPage() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-tv-text-muted">{t("mission.map")}</p>
    </div>
  );
}
