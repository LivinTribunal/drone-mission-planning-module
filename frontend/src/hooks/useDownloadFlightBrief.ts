import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "@/api/client";
import { downloadFlightBrief } from "@/api/missions";

export default function useDownloadFlightBrief(
  missionId: string | undefined,
  missionName: string | undefined,
  showNotification: (msg: string) => void,
) {
  const { t } = useTranslation();
  const [isDownloadingBrief, setIsDownloadingBrief] = useState(false);

  const handleDownloadBrief = useCallback(async () => {
    if (!missionId) return;
    setIsDownloadingBrief(true);
    try {
      const { blob, filename } = await downloadFlightBrief(missionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `FlightBrief_${missionName ?? "mission"}.pdf`;
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      showNotification(
        isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : t("mission.flightBrief.error"),
      );
    } finally {
      setIsDownloadingBrief(false);
    }
  }, [missionId, missionName, t, showNotification]);

  return { isDownloadingBrief, handleDownloadBrief };
}
