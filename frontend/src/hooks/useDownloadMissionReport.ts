import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { downloadMissionReport } from "@/api/missions";

/** download mission technical report pdf and trigger browser save dialog. */
export default function useDownloadMissionReport(
  missionId: string | undefined,
  missionName: string | undefined,
  showNotification: (msg: string) => void,
) {
  const { t } = useTranslation();
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const handleDownloadReport = useCallback(async () => {
    if (!missionId) return;
    setIsDownloadingReport(true);
    try {
      const { blob, filename } = await downloadMissionReport(missionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `MissionReport_${missionName ?? "mission"}.pdf`;
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error(
        "mission report download failed:",
        err instanceof Error ? err.message : String(err),
      );
      showNotification(t("mission.missionReport.error"));
    } finally {
      setIsDownloadingReport(false);
    }
  }, [missionId, missionName, t, showNotification]);

  return { isDownloadingReport, handleDownloadReport };
}
