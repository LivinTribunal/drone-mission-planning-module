import { useTranslation } from "react-i18next";

interface HeadingInfoCardProps {
  bearing: number;
  onClose: () => void;
}

export default function HeadingInfoCard({
  bearing,
  onClose,
}: HeadingInfoCardProps) {
  /** persistent info card showing completed heading measurement. */
  const { t } = useTranslation();

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg min-w-[200px] flex-shrink-0"
      data-testid="heading-info-card"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("map.headingResult")}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 bg-tv-surface border border-tv-border text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
          aria-label={t("common.close")}
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="border-t border-tv-border px-3 pb-3 pt-2 space-y-1">
        <div className="flex justify-between gap-3 text-xs">
          <span className="text-tv-text-muted">{t("map.bearing")}</span>
          <span className="text-tv-text-primary font-medium">
            {bearing.toFixed(2)}&deg;
          </span>
        </div>
      </div>
    </div>
  );
}
