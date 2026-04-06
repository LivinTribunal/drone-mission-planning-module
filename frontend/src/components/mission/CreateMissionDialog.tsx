import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createMission } from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";
import type { DroneProfileResponse } from "@/types/droneProfile";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";

interface CreateMissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  airportId: string;
  defaultDroneProfileId?: string | null;
}

export default function CreateMissionDialog({
  isOpen,
  onClose,
  airportId,
  defaultDroneProfileId,
}: CreateMissionDialogProps) {
  /**  dialog for creating a new mission with name and drone profile. */
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [droneProfileId, setDroneProfileId] = useState("");
  const [droneProfiles, setDroneProfiles] = useState<DroneProfileResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [droneLoadError, setDroneLoadError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDroneLoadError(false);
      listDroneProfiles()
        .then((res) => setDroneProfiles(res.data))
        .catch(() => setDroneLoadError(true));
      setName("");
      setDroneProfileId(defaultDroneProfileId ?? "");
      setFormError(null);
      setSubmitError(null);
    }
  }, [isOpen, defaultDroneProfileId]);

  function handleSubmit(e: React.FormEvent) {
    /** validate and submit the create mission form. */
    e.preventDefault();
    setFormError(null);
    setSubmitError(null);

    if (!name.trim()) {
      setFormError(t("dashboard.nameRequired"));
      return;
    }
    if (!droneProfileId) {
      setFormError(t("dashboard.droneRequired"));
      return;
    }

    setLoading(true);
    createMission({
      name: name.trim(),
      airport_id: airportId,
      drone_profile_id: droneProfileId,
    })
      .then((mission) => {
        onClose();
        navigate(`/operator-center/missions/${mission.id}/overview`);
      })
      .catch(() => {
        setSubmitError(t("dashboard.createError"));
      })
      .finally(() => setLoading(false));
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("dashboard.createMission")}>
      <form onSubmit={handleSubmit} data-testid="create-mission-form">
        <div className="space-y-4">
          <Input
            id="mission-name"
            label={t("dashboard.missionName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dashboard.missionNamePlaceholder")}
            data-testid="mission-name-input"
          />

          <div>
            <label
              htmlFor="drone-profile"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("dashboard.selectDrone")}
            </label>
            <select
              id="drone-profile"
              value={droneProfileId}
              onChange={(e) => setDroneProfileId(e.target.value)}
              className="w-full rounded-full border border-tv-border bg-tv-bg px-4 py-2.5 text-sm
                text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="drone-profile-select"
            >
              <option value="">{t("dashboard.selectDronePlaceholder")}</option>
              {droneProfiles.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name}
                </option>
              ))}
            </select>
            {droneLoadError && (
              <p className="text-xs text-tv-error mt-1" data-testid="drone-load-error">
                {t("dashboard.droneLoadError")}
              </p>
            )}
          </div>

          {formError && (
            <p className="text-xs text-tv-error" data-testid="form-error">
              {formError}
            </p>
          )}
          {submitError && (
            <p className="text-xs text-tv-error" data-testid="submit-error">
              {submitError}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t("common.loading") : t("common.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
