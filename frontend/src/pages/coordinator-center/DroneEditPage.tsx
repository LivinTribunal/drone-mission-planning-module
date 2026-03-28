import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDroneProfile,
  listDroneProfiles,
  createDroneProfile,
  updateDroneProfile,
  deleteDroneProfile,
} from "@/api/droneProfiles";
import type {
  DroneProfileResponse,
  DroneProfileUpdate,
} from "@/types/droneProfile";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";

interface FieldDef {
  key: keyof DroneProfileResponse;
  labelKey: string;
  unitKey?: string;
  type: "text" | "number";
}

const FIELDS: FieldDef[] = [
  { key: "name", labelKey: "name", type: "text" },
  { key: "manufacturer", labelKey: "manufacturer", type: "text" },
  { key: "model", labelKey: "model", type: "text" },
  { key: "max_speed", labelKey: "maxSpeed", unitKey: "ms", type: "number" },
  {
    key: "max_climb_rate",
    labelKey: "maxClimbRate",
    unitKey: "ms",
    type: "number",
  },
  {
    key: "max_altitude",
    labelKey: "maxAltitude",
    unitKey: "m",
    type: "number",
  },
  {
    key: "battery_capacity",
    labelKey: "batteryCapacity",
    unitKey: "mah",
    type: "number",
  },
  {
    key: "endurance_minutes",
    labelKey: "endurance",
    unitKey: "min",
    type: "number",
  },
  {
    key: "camera_resolution",
    labelKey: "cameraResolution",
    type: "text",
  },
  {
    key: "camera_frame_rate",
    labelKey: "cameraFrameRate",
    unitKey: "fps",
    type: "number",
  },
  {
    key: "sensor_fov",
    labelKey: "sensorFov",
    unitKey: "degrees",
    type: "number",
  },
  { key: "weight", labelKey: "weight", unitKey: "kg", type: "number" },
];

function droneToForm(drone: DroneProfileResponse): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of FIELDS) {
    const val = drone[f.key];
    form[f.key] = val != null ? String(val) : "";
  }
  return form;
}

function formToPayload(form: Record<string, string>): DroneProfileUpdate {
  const payload: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const val = form[f.key];
    if (f.type === "number") {
      payload[f.key] = val ? Number(val) : null;
    } else {
      payload[f.key] = val || null;
    }
  }
  // name should not be null
  if (form.name) payload.name = form.name;
  return payload as DroneProfileUpdate;
}

export default function DroneEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [drone, setDrone] = useState<DroneProfileResponse | null>(null);
  const [allDrones, setAllDrones] = useState<DroneProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState("");
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nameError, setNameError] = useState("");

  // create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");

  // delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // unsaved changes dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // drone selector
  const [showSelector, setShowSelector] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const isDirty = useMemo(() => {
    if (!drone || !isEditing) return false;
    const original = droneToForm(drone);
    return FIELDS.some((f) => formData[f.key] !== original[f.key]);
  }, [drone, formData, isEditing]);

  const fetchDrone = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    Promise.all([getDroneProfile(id), listDroneProfiles({ limit: 200 })])
      .then(([droneData, listData]) => {
        setDrone(droneData);
        setAllDrones(listData.data);
        setFormData(droneToForm(droneData));
        setIsEditing(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDrone();
  }, [fetchDrone]);

  // close selector on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        selectorRef.current &&
        !selectorRef.current.contains(e.target as Node)
      ) {
        setShowSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // warn before browser unload with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function showToast(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(""), 3000);
  }

  function tryNavigate(path: string) {
    if (isDirty) {
      setPendingNav(path);
      setShowUnsavedDialog(true);
    } else {
      navigate(path);
    }
  }

  function handleDiscardAndNavigate() {
    setIsEditing(false);
    setShowUnsavedDialog(false);
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }

  function handleSelectDrone(droneId: string) {
    setShowSelector(false);
    if (droneId === id) return;
    tryNavigate(`/coordinator-center/drones/${droneId}`);
  }

  function handleToggleEdit() {
    if (isEditing) {
      // cancel editing
      if (drone) setFormData(droneToForm(drone));
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }

  async function handleSave() {
    if (!id || !drone) return;
    if (!formData.name?.trim()) {
      setNameError(t("coordinator.drones.create.nameRequired"));
      return;
    }
    try {
      const updated = await updateDroneProfile(id, formToPayload(formData));
      setDrone(updated);
      setFormData(droneToForm(updated));
      setIsEditing(false);
      showToast(t("coordinator.drones.detail.saved"));
    } catch {
      showToast(t("coordinator.drones.detail.saveError"));
    }
  }

  async function handleDuplicate() {
    if (!drone) return;
    try {
      const payload = {
        name: `${drone.name} ${t("coordinator.drones.duplicate.suffix")}`,
        manufacturer: drone.manufacturer,
        model: drone.model,
        max_speed: drone.max_speed,
        max_climb_rate: drone.max_climb_rate,
        max_altitude: drone.max_altitude,
        battery_capacity: drone.battery_capacity,
        endurance_minutes: drone.endurance_minutes,
        camera_resolution: drone.camera_resolution,
        camera_frame_rate: drone.camera_frame_rate,
        sensor_fov: drone.sensor_fov,
        weight: drone.weight,
      };
      const created = await createDroneProfile(payload);
      navigate(`/coordinator-center/drones/${created.id}`);
    } catch {
      showToast(t("coordinator.drones.duplicate.error"));
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteDroneProfile(id);
      setShowDeleteDialog(false);
      navigate("/coordinator-center/drones");
    } catch {
      showToast(t("coordinator.drones.delete.deleteError"));
    }
  }

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError(t("coordinator.drones.create.nameRequired"));
      return;
    }
    try {
      const created = await createDroneProfile({ name: createName.trim() });
      setShowCreateDialog(false);
      setCreateName("");
      setCreateError("");
      navigate(`/coordinator-center/drones/${created.id}`);
    } catch {
      setCreateError(t("coordinator.drones.create.createError"));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <svg
          className="h-6 w-6 animate-spin text-tv-text-muted"
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
    );
  }

  if (error || !drone) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg">
        <p className="text-sm text-tv-error">
          {t("coordinator.drones.loadError")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-tv-bg">
      {/* left panel */}
      <div className="w-72 flex-shrink-0 border-r border-tv-border bg-tv-surface flex flex-col">
        {/* header */}
        <div className="px-4 py-4 border-b border-tv-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-tv-text-secondary uppercase tracking-wider">
              {t("coordinator.drones.title")}
            </span>
            <button
              onClick={() => tryNavigate("/coordinator-center/drones")}
              className="rounded-full p-1 text-tv-text-secondary hover:bg-tv-surface-hover transition-colors"
              title={t("coordinator.drones.detail.backToList")}
              data-testid="back-to-list"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* drone selector */}
          <div className="relative" ref={selectorRef}>
            <button
              onClick={() => setShowSelector(!showSelector)}
              className="w-full flex items-center justify-between rounded-full px-3 py-2 text-sm
                font-semibold text-tv-text-primary bg-tv-bg hover:bg-tv-surface-hover transition-colors"
              data-testid="drone-selector"
            >
              <span className="truncate">{drone.name}</span>
              <svg
                className={`h-4 w-4 flex-shrink-0 transition-transform ${showSelector ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {showSelector && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-2xl border border-tv-border bg-tv-surface p-1">
                {allDrones.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSelectDrone(d.id)}
                    className={`w-full text-left rounded-xl px-3 py-2 text-sm transition-colors truncate ${
                      d.id === id
                        ? "bg-tv-accent text-tv-accent-text"
                        : "text-tv-text-primary hover:bg-tv-surface-hover"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* action buttons */}
        <div className="px-4 py-3 flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={() => {
              setShowCreateDialog(true);
              setCreateName("");
              setCreateError("");
            }}
            data-testid="detail-add-new"
          >
            {t("coordinator.drones.detail.addNew")}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleToggleEdit}
            data-testid="detail-edit-toggle"
          >
            {isEditing
              ? t("common.cancel")
              : t("coordinator.drones.detail.edit")}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleDuplicate}
            data-testid="detail-duplicate"
          >
            {t("coordinator.drones.detail.duplicate")}
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="detail-delete"
          >
            {t("coordinator.drones.detail.delete")}
          </Button>
        </div>
      </div>

      {/* right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-2xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-tv-text-primary">
              {drone.name}
            </h2>
            <span className="text-xs text-tv-text-muted rounded-full border border-tv-border px-3 py-1">
              {isEditing
                ? t("coordinator.drones.detail.editing")
                : t("coordinator.drones.detail.readOnly")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map((field) => {
              const label = t(`coordinator.drones.fields.${field.labelKey}`);
              const unitLabel = field.unitKey
                ? t(`coordinator.drones.units.${field.unitKey}`)
                : "";

              if (isEditing) {
                return (
                  <div key={field.key}>
                    <Input
                      id={`edit-${field.key}`}
                      label={unitLabel ? `${label} (${unitLabel})` : label}
                      type={field.type}
                      step={field.type === "number" ? "any" : undefined}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => {
                        if (field.key === "name") setNameError("");
                        setFormData((f) => ({
                          ...f,
                          [field.key]: e.target.value,
                        }));
                      }}
                      data-testid={`edit-${field.key}`}
                    />
                    {field.key === "name" && nameError && (
                      <p className="mt-1 text-sm text-tv-error" data-testid="name-error">
                        {nameError}
                      </p>
                    )}
                  </div>
                );
              }

              const rawVal = drone[field.key];
              const display =
                rawVal != null
                  ? unitLabel
                    ? `${rawVal} ${unitLabel}`
                    : String(rawVal)
                  : "\u2014";

              return (
                <div key={field.key}>
                  <span className="block text-xs font-medium text-tv-text-secondary mb-1">
                    {label}
                  </span>
                  <span className="text-sm text-tv-text-primary">
                    {display}
                  </span>
                </div>
              );
            })}
          </div>

          {isEditing && (
            <div className="mt-6 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!isDirty}
                data-testid="save-drone"
              >
                {t("coordinator.drones.detail.save")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* toast notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-tv-border bg-tv-surface px-4 py-3 text-sm text-tv-text-primary">
          {notification}
        </div>
      )}

      {/* create dialog */}
      <Modal
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setCreateName("");
          setCreateError("");
        }}
        title={t("coordinator.drones.create.title")}
      >
        <form onSubmit={handleCreateNew}>
          <Input
            id="detail-create-name"
            label={t("coordinator.drones.fields.name")}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={t("coordinator.drones.create.namePlaceholder")}
            required
            data-testid="detail-create-name"
          />
          {createError && (
            <p className="mt-2 text-sm text-tv-error">{createError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowCreateDialog(false);
                setCreateName("");
                setCreateError("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!createName.trim()}>
              {t("coordinator.drones.create.add")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* delete confirmation */}
      <Modal
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={t("coordinator.drones.delete.title")}
      >
        <p className="text-sm text-tv-text-primary mb-6">
          {t("coordinator.drones.delete.confirm", { name: drone.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowDeleteDialog(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </Modal>

      {/* unsaved changes dialog */}
      <Modal
        isOpen={showUnsavedDialog}
        onClose={() => {
          setShowUnsavedDialog(false);
          setPendingNav(null);
        }}
        title={t("coordinator.drones.detail.unsavedTitle")}
      >
        <p className="text-sm text-tv-text-primary mb-6">
          {t("coordinator.drones.detail.unsavedMessage")}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setShowUnsavedDialog(false);
              setPendingNav(null);
            }}
          >
            {t("coordinator.drones.detail.keepEditing")}
          </Button>
          <Button variant="danger" onClick={handleDiscardAndNavigate}>
            {t("coordinator.drones.detail.discardChanges")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
