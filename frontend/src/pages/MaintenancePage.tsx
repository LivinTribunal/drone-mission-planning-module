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
            d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
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
