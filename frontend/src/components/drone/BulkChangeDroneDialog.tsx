import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import Badge from "@/components/common/Badge";
import { listMissions } from "@/api/missions";
import { bulkChangeDrone } from "@/api/airports";
import type { MissionResponse } from "@/types/mission";
import type { DroneProfileResponse } from "@/types/droneProfile";
import type { MissionStatus } from "@/types/enums";

interface BulkChangeDroneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  airportId: string;
  currentDroneId: string;
  currentDroneName: string;
  allDrones: DroneProfileResponse[];
  onSuccess: (updatedCount: number, regressedCount: number) => void;
}

const CHANGEABLE_STATUSES = new Set(["DRAFT", "PLANNED"]);

/** two-tab bulk change drone dialog for operator drone management. */
export default function BulkChangeDroneDialog({
  isOpen,
  onClose,
  airportId,
  currentDroneId,
  currentDroneName,
  allDrones,
  onSuccess,
}: BulkChangeDroneDialogProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState<"ALL_DRAFT" | "SELECTED">("ALL_DRAFT");
  const [targetDroneId, setTargetDroneId] = useState("");
  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const otherDrones = allDrones.filter((d) => d.id !== currentDroneId);

  const draftCount = missions.filter((m) => m.status === "DRAFT").length;

  const fetchMissions = useCallback(() => {
    if (!isOpen || !airportId || !currentDroneId) return;
    setLoading(true);
    listMissions({
      airport_id: airportId,
      drone_profile_id: currentDroneId,
      limit: 200,
    })
      .then((res) => {
        setMissions(res.data);
        setFetchError(null);
      })
      .catch(() => {
        setMissions([]);
        setFetchError(t("operatorDrones.fetchMissionsError", { defaultValue: "Failed to load missions" }));
      })
      .finally(() => setLoading(false));
  }, [isOpen, airportId, currentDroneId]);

  useEffect(() => {
    if (isOpen) {
      fetchMissions();
      setTab("ALL_DRAFT");
      setTargetDroneId("");
      setSelectedIds(new Set());
      setError(null);
      setFetchError(null);
    }
  }, [isOpen, fetchMissions]);

  /** toggle checkbox for a mission. */
  function toggleMission(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** submit the bulk change. */
  async function handleSubmit() {
    if (!targetDroneId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await bulkChangeDrone(airportId, targetDroneId, {
        fromDroneId: currentDroneId,
        scope: tab,
        missionIds: tab === "SELECTED" ? Array.from(selectedIds) : [],
      });
      onSuccess(result.updated_count, result.regressed_count);
      onClose();
    } catch (err) {
      console.error("bulk change failed:", err instanceof Error ? err.message : String(err));
      setError(t("operatorDrones.bulkChangeError"));
    } finally {
      setSubmitting(false);
    }
  }

  const targetDroneName =
    allDrones.find((d) => d.id === targetDroneId)?.name ?? "";

  const canSubmitAllDraft = !!targetDroneId && draftCount > 0;
  const canSubmitSelected = !!targetDroneId && selectedIds.size > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("operatorDrones.bulkChange")}>
      {/* tab pills */}
      <div className="flex gap-1 mb-4 rounded-full bg-tv-bg p-1 border border-tv-border">
        <button
          onClick={() => setTab("ALL_DRAFT")}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            tab === "ALL_DRAFT"
              ? "bg-[var(--tv-nav-active-bg)] text-[var(--tv-nav-active-text)]"
              : "text-tv-text-secondary hover:text-tv-text-primary"
          }`}
        >
          {t("operatorDrones.allDraft")}
        </button>
        <button
          onClick={() => setTab("SELECTED")}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            tab === "SELECTED"
              ? "bg-[var(--tv-nav-active-bg)] text-[var(--tv-nav-active-text)]"
              : "text-tv-text-secondary hover:text-tv-text-primary"
          }`}
        >
          {t("operatorDrones.selectMissions")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg
            className="h-5 w-5 animate-spin text-tv-text-muted"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      ) : (
        <>
          {tab === "ALL_DRAFT" && (
            <div>
              <p className="text-sm text-tv-text-secondary mb-1">
                {t("operatorDrones.allDraftDesc")}
              </p>
              <p className="text-xs text-tv-text-muted mb-4">
                {t("operatorDrones.draftCount", { count: draftCount })}
              </p>
            </div>
          )}

          {tab === "SELECTED" && (
            <div className="max-h-48 overflow-y-auto mb-4 rounded-xl border border-tv-border">
              {fetchError ? (
                <p className="px-3 py-4 text-sm text-tv-error italic text-center">
                  {fetchError}
                </p>
              ) : missions.length === 0 ? (
                <p className="px-3 py-4 text-sm text-tv-text-muted italic text-center">
                  {t("operatorDrones.noMissionsForDrone")}
                </p>
              ) : (
                missions.map((m) => {
                  const canChange = CHANGEABLE_STATUSES.has(m.status);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-tv-border last:border-b-0 ${
                        canChange
                          ? "hover:bg-tv-surface-hover cursor-pointer"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                      title={
                        canChange
                          ? undefined
                          : t("operatorDrones.cannotChange", {
                              status: m.status,
                            })
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleMission(m.id)}
                        disabled={!canChange}
                        className="rounded accent-[var(--tv-accent)]"
                      />
                      <span className="flex-1 min-w-0 text-sm text-tv-text-primary truncate">
                        {m.name}
                      </span>
                      <Badge
                        status={m.status as MissionStatus}
                        className="flex-shrink-0"
                      />
                    </label>
                  );
                })
              )}
            </div>
          )}

          {/* target drone dropdown */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("operatorDrones.targetDrone")}
            </label>
            <select
              value={targetDroneId}
              onChange={(e) => setTargetDroneId(e.target.value)}
              className="w-full rounded-full border border-tv-border bg-tv-bg px-4 py-2.5 text-sm
                text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
            >
              <option value="">{t("dashboard.selectDronePlaceholder")}</option>
              {otherDrones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* confirmation text */}
          {targetDroneId && (
            <p className="text-sm text-tv-text-secondary mb-4">
              {t("operatorDrones.bulkChangeConfirm", {
                count:
                  tab === "ALL_DRAFT" ? draftCount : selectedIds.size,
                from: currentDroneName,
                to: targetDroneName,
              })}
            </p>
          )}

          {error && (
            <p className="text-sm text-tv-error mb-4">{error}</p>
          )}

          {/* actions */}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                (tab === "ALL_DRAFT" ? !canSubmitAllDraft : !canSubmitSelected)
              }
            >
              {submitting
                ? t("common.loading")
                : tab === "ALL_DRAFT"
                  ? t("operatorDrones.changeAll")
                  : t("operatorDrones.changeSelected")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
