import { useTranslation } from "react-i18next";

export default function MaintenancePage() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-screen bg-tv-bg">
      <div className="text-center p-8">
        <svg
          className="mx-auto h-16 w-16 text-tv-text-muted mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17l-5.1-5.1a2.25 2.25 0 113.18-3.18l5.1 5.1m-6.36 6.36l6.36-6.36m3.18 3.18a2.25 2.25 0 11-3.18 3.18l-5.1-5.1"
          />
        </svg>
        <h1 className="text-2xl font-semibold text-tv-text-primary mb-2">
          {t("auth.maintenanceTitle")}
        </h1>
        <p className="text-tv-text-secondary">{t("auth.maintenanceMessage")}</p>
      </div>
    </div>
  );
}
