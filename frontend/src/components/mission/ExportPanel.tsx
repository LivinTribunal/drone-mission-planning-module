import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Download, FileText, Loader2 } from "lucide-react";
import type { MissionStatus } from "@/types/enums";
import type { MissionDetailResponse } from "@/types/mission";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";

export interface ExportPanelProps {
  mission: MissionDetailResponse;
  onExport: (formats: string[]) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isExporting: boolean;
  statsSlot?: ReactNode;
  onDownloadReport?: () => void;
  isDownloadingReport?: boolean;
  hasFlightPlan?: boolean;
}

const EXPORT_FORMATS = [
  { value: "KML", labelKey: "formatKml", descKey: "formatKmlDesc" },
  { value: "KMZ", labelKey: "formatKmz", descKey: "formatKmzDesc" },
  { value: "JSON", labelKey: "formatJson", descKey: "formatJsonDesc" },
  { value: "MAVLINK", labelKey: "formatMavlink", descKey: "formatMavlinkDesc" },
  { value: "UGCS", labelKey: "formatUgcs", descKey: "formatUgcsDesc" },
  { value: "WPML", labelKey: "formatWpml", descKey: "formatWpmlDesc" },
  { value: "CSV", labelKey: "formatCsv", descKey: "formatCsvDesc" },
  { value: "GPX", labelKey: "formatGpx", descKey: "formatGpxDesc" },
  { value: "LITCHI", labelKey: "formatLitchi", descKey: "formatLitchiDesc" },
  { value: "DRONEDEPLOY", labelKey: "formatDronedeploy", descKey: "formatDronedeployDesc" },
] as const;

function canExport(status: MissionStatus): boolean {
  return status === "VALIDATED" || status === "EXPORTED";
}

function isTerminal(status: MissionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export default function ExportPanel({
  mission,
  onExport,
  onComplete,
  onCancel,
  onDelete,
  isExporting,
  statsSlot,
  onDownloadReport,
  isDownloadingReport = false,
  hasFlightPlan = false,
}: ExportPanelProps) {
  const { t } = useTranslation();
  const [exportCollapsed, setExportCollapsed] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(["KML"]),
  );
  const [confirmModal, setConfirmModal] = useState<
    "complete" | "cancel" | "delete" | null
  >(null);

  const status = mission.status;
  const exportEnabled = canExport(status);
  const terminal = isTerminal(status);

  // lifecycle button gating
  const canComplete = status === "EXPORTED";
  const canCancelMission = status === "EXPORTED";
  const canDelete = status !== "EXPORTED" && status !== "COMPLETED";

  function toggleFormat(fmt: string) {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(fmt)) {
        next.delete(fmt);
      } else {
        next.add(fmt);
      }
      return next;
    });
  }

  function handleDownload() {
    if (selectedFormats.size > 0) {
      onExport(Array.from(selectedFormats));
    }
  }

  function handleConfirm() {
    if (confirmModal === "complete") onComplete();
    if (confirmModal === "cancel") onCancel();
    if (confirmModal === "delete") onDelete();
    setConfirmModal(null);
  }

  const confirmConfig = {
    complete: {
      title: t("mission.validationExportPage.completeConfirmTitle"),
      message: t("mission.validationExportPage.completeConfirmMessage"),
      color: "bg-tv-accent text-tv-accent-text hover:bg-tv-accent-hover",
    },
    cancel: {
      title: t("mission.validationExportPage.cancelConfirmTitle"),
      message: t("mission.validationExportPage.cancelConfirmMessage"),
      color: "bg-tv-warning text-white hover:opacity-90",
    },
    delete: {
      title: t("mission.validationExportPage.deleteConfirmTitle"),
      message: t("mission.validationExportPage.deleteConfirmMessage"),
      color: "bg-tv-error text-white hover:opacity-90",
    },
  };

  return (
    <div className="flex flex-col gap-4" data-testid="export-panel">
      {/* export section */}
      <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
        <button
          onClick={() => setExportCollapsed(!exportCollapsed)}
          className="flex items-center justify-between w-full text-sm font-semibold text-tv-text-primary"
        >
          <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border">
            {t("mission.validationExportPage.export")}
          </span>
          <div className="flex items-center gap-2">
            {!exportEnabled && !terminal && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-tv-warning text-white">
                {t("mission.validationExportPage.needsValidation")}
              </span>
            )}
            {exportCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </div>
        </button>

        {!exportCollapsed && (
          <div className="border-b border-tv-border -mx-4 mt-3" />
        )}

        {!exportCollapsed && (
          <div className="mt-3 flex flex-col gap-3">
            {/* format checkboxes */}
            <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto">
              {EXPORT_FORMATS.map((fmt) => (
                <label
                  key={fmt.value}
                  className={`flex items-start gap-3 px-3 py-2 rounded-xl bg-tv-bg cursor-pointer ${
                    !exportEnabled && !terminal
                      ? "opacity-50 cursor-not-allowed"
                      : terminal
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFormats.has(fmt.value)}
                    onChange={() => toggleFormat(fmt.value)}
                    disabled={!exportEnabled || terminal}
                    className="mt-0.5 accent-[var(--tv-accent)]"
                    data-testid={`format-${fmt.value}`}
                  />
                  <div>
                    <span className="text-sm font-medium text-tv-text-primary">
                      {t(`mission.validationExportPage.${fmt.labelKey}`)}
                    </span>
                    <p className="text-xs text-tv-text-muted">
                      {t(`mission.validationExportPage.${fmt.descKey}`)}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* scope info */}
            {!terminal && (
              <p className="text-xs text-tv-text-muted italic px-1">
                {t(
                  `mission.validationExportPage.scopeInfo.${
                    mission.flight_plan_scope === "NO_TAKEOFF_LANDING"
                      ? "noTakeoffLanding"
                      : mission.flight_plan_scope === "MEASUREMENTS_ONLY"
                        ? "measurementsOnly"
                        : "full"
                  }`,
                )}
              </p>
            )}

            {/* terminal status message */}
            {terminal && (
              <p className="text-xs text-tv-text-muted italic">
                {t("mission.validationExportPage.exportDisabledTerminal")}
              </p>
            )}

            {/* download button */}
            <Button
              variant="primary"
              onClick={handleDownload}
              disabled={
                !exportEnabled || selectedFormats.size === 0 || isExporting
              }
              title={!exportEnabled && !terminal ? t("mission.validationExportPage.needsValidation") : undefined}
              className="w-full flex items-center justify-center gap-2"
              data-testid="download-export-btn"
            >
              <Download className="h-4 w-4" />
              {isExporting
                ? t("mission.validationExportPage.downloading")
                : t("mission.validationExportPage.downloadExport")}
            </Button>
          </div>
        )}
      </div>

      {/* mission technical report */}
      <div className="bg-tv-surface border border-tv-border rounded-2xl p-4" data-testid="mission-report-section">
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border text-sm font-semibold text-tv-text-primary">
            {t("mission.missionReport.title")}
          </span>
        </div>
        <p className="text-xs text-tv-text-muted mb-3">
          {t("mission.missionReport.description")}
        </p>
        <Button
          variant="secondary"
          onClick={() => onDownloadReport?.()}
          disabled={!hasFlightPlan || isDownloadingReport || !onDownloadReport}
          title={!hasFlightPlan ? t("mission.missionReport.noFlightPlan") : undefined}
          className="w-full flex items-center justify-center gap-2"
          data-testid="download-report-btn"
        >
          {isDownloadingReport ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {isDownloadingReport
            ? t("mission.missionReport.generating")
            : t("mission.missionReport.download")}
        </Button>
      </div>

      {statsSlot}

      {/* lifecycle buttons */}
      <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
        <span className="rounded-full px-3 py-1 bg-tv-bg border border-tv-border text-sm font-semibold text-tv-text-primary">
          {t("mission.validationExportPage.lifecycle")}
        </span>
        <div className="border-b border-tv-border -mx-4 mt-3" />
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => setConfirmModal("complete")}
            disabled={!canComplete}
            title={!canComplete ? t("mission.validationExportPage.completeTooltip") : undefined}
            className={`w-full px-4 py-2.5 text-sm font-semibold rounded-full transition-colors border ${
              canComplete
                ? "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
                : "opacity-50 cursor-not-allowed border-tv-border text-tv-text-muted"
            }`}
            data-testid="complete-btn"
          >
            {t("mission.validationExportPage.completeMission")}
          </button>
          <button
            onClick={() => setConfirmModal("cancel")}
            disabled={!canCancelMission}
            title={!canCancelMission ? t("mission.validationExportPage.cancelTooltip") : undefined}
            className={`w-full px-4 py-2.5 text-sm font-semibold rounded-full transition-colors border ${
              canCancelMission
                ? "border-tv-warning text-tv-warning hover:bg-tv-warning hover:text-white"
                : "opacity-50 cursor-not-allowed border-tv-border text-tv-text-muted"
            }`}
            data-testid="cancel-mission-btn"
          >
            {t("mission.validationExportPage.cancelMission")}
          </button>
          <Button
            variant="danger"
            onClick={() => setConfirmModal("delete")}
            disabled={!canDelete}
            className="w-full"
            data-testid="delete-btn"
          >
            {t("mission.validationExportPage.deleteMission")}
          </Button>
        </div>
      </div>

      {/* confirmation modal */}
      {confirmModal && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmModal(null)}
          title={confirmConfig[confirmModal].title}
        >
          <p className="text-sm text-tv-text-secondary mb-4">
            {confirmConfig[confirmModal].message}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>
              {t("common.cancel")}
            </Button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2.5 text-sm font-semibold rounded-full transition-colors ${confirmConfig[confirmModal].color}`}
              data-testid="confirm-action-btn"
            >
              {t("mission.validationExportPage.confirm")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
