import { useTranslation } from "react-i18next";

type BadgeStatus =
  | "DRAFT"
  | "PLANNED"
  | "VALIDATED"
  | "EXPORTED"
  | "COMPLETED"
  | "CANCELLED";

interface BadgeProps {
  status: BadgeStatus;
  className?: string;
}

const statusStyles: Record<BadgeStatus, string> = {
  DRAFT:
    "bg-[var(--tv-status-draft-bg)] text-[var(--tv-status-draft-text)]",
  PLANNED:
    "bg-[var(--tv-status-planned-bg)] text-[var(--tv-status-planned-text)]",
  VALIDATED:
    "bg-[var(--tv-status-validated-bg)] text-[var(--tv-status-validated-text)]",
  EXPORTED:
    "bg-[var(--tv-status-exported-bg)] text-[var(--tv-status-exported-text)]",
  COMPLETED:
    "bg-[var(--tv-status-completed-bg)] text-[var(--tv-status-completed-text)]",
  CANCELLED:
    "bg-[var(--tv-status-cancelled-bg)] text-[var(--tv-status-cancelled-text)]",
};

export default function Badge({ status, className = "" }: BadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]} ${className}`}
    >
      {t(`missionStatus.${status}`)}
    </span>
  );
}
