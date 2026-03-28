import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  listDroneProfiles,
  createDroneProfile,
  deleteDroneProfile,
} from "@/api/droneProfiles";
import type { DroneProfileResponse } from "@/types/droneProfile";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import RowActionMenu from "@/components/common/RowActionMenu";

export default function DroneListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [drones, setDrones] = useState<DroneProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");

  // create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    max_speed: "",
    max_altitude: "",
    endurance_minutes: "",
    camera_frame_rate: "",
  });
  const [createError, setCreateError] = useState("");

  // notifications
  const [notification, setNotification] = useState("");
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<DroneProfileResponse | null>(
    null,
  );

  const fetchDrones = useCallback(() => {
    setLoading(true);
    setError(false);
    listDroneProfiles({ limit: 200 })
      .then((res) => setDrones(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDrones();
  }, [fetchDrones]);

  function showToast(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(""), 3000);
  }

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const d of drones) {
      if (d.manufacturer) set.add(d.manufacturer);
    }
    return Array.from(set).sort();
  }, [drones]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return drones.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (manufacturerFilter && d.manufacturer !== manufacturerFilter)
        return false;
      return true;
    });
  }, [drones, search, manufacturerFilter]);

  function resetCreateForm() {
    setCreateForm({
      name: "",
      max_speed: "",
      max_altitude: "",
      endurance_minutes: "",
      camera_frame_rate: "",
    });
    setCreateError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError(t("coordinator.drones.create.nameRequired"));
      return;
    }
    try {
      const created = await createDroneProfile({
        name: createForm.name.trim(),
        max_speed: createForm.max_speed
          ? Number(createForm.max_speed)
          : undefined,
        max_altitude: createForm.max_altitude
          ? Number(createForm.max_altitude)
          : undefined,
        endurance_minutes: createForm.endurance_minutes
          ? Number(createForm.endurance_minutes)
          : undefined,
        camera_frame_rate: createForm.camera_frame_rate
          ? Number(createForm.camera_frame_rate)
          : undefined,
      });
      setShowCreateDialog(false);
      resetCreateForm();
      navigate(`/coordinator-center/drones/${created.id}`);
    } catch {
      setCreateError(t("coordinator.drones.create.createError"));
    }
  }

  async function handleDuplicate(drone: DroneProfileResponse) {
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
    if (!deleteTarget) return;
    try {
      await deleteDroneProfile(deleteTarget.id);
      setDeleteTarget(null);
      fetchDrones();
    } catch {
      showToast(t("coordinator.drones.delete.deleteError"));
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-12">
      {/* top row */}
      <div className="flex items-center gap-3 w-full max-w-5xl mb-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-tv-accent flex-shrink-0">
          <svg
            className="h-5 w-5 text-tv-accent-text"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("coordinator.drones.searchPlaceholder")}
          className="flex-1 rounded-full border border-tv-border bg-tv-surface px-5 py-2.5
            text-sm text-tv-text-primary placeholder:text-tv-text-muted
            focus:outline-none focus:border-tv-accent"
          data-testid="drone-search"
        />
        <select
          value={manufacturerFilter}
          onChange={(e) => setManufacturerFilter(e.target.value)}
          className="rounded-full border border-tv-border bg-tv-surface px-4 py-2.5 text-sm
            text-tv-text-primary focus:outline-none focus:border-tv-accent"
          data-testid="manufacturer-filter"
        >
          <option value="">
            {t("coordinator.drones.allManufacturers")}
          </option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="add-drone-btn"
        >
          {t("coordinator.drones.addNew")}
        </Button>
      </div>

      {/* drone table */}
      <div className="w-full max-w-5xl rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
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
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-tv-error">
            {t("coordinator.drones.loadError")}
            <button
              onClick={fetchDrones}
              className="ml-2 underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {drones.length === 0
              ? t("coordinator.drones.noDrones")
              : t("coordinator.drones.noMatch")}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-tv-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                  {t("coordinator.drones.columns.name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                  {t("coordinator.drones.columns.manufacturer")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                  {t("coordinator.drones.columns.model")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                  {t("coordinator.drones.columns.maxSpeed")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                  {t("coordinator.drones.columns.endurance")}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((drone) => (
                <tr
                  key={drone.id}
                  onClick={() =>
                    navigate(`/coordinator-center/drones/${drone.id}`)
                  }
                  className="border-b border-tv-border last:border-b-0 cursor-pointer
                    text-sm text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
                  data-testid={`drone-row-${drone.id}`}
                >
                  <td className="px-4 py-3 font-semibold">{drone.name}</td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {drone.manufacturer || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {drone.model || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {drone.max_speed != null
                      ? `${drone.max_speed} ${t("coordinator.drones.units.ms")}`
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-tv-text-secondary">
                    {drone.endurance_minutes != null
                      ? `${drone.endurance_minutes} ${t("coordinator.drones.units.min")}`
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <RowActionMenu
                      actions={[
                        {
                          label: t("coordinator.drones.actions.duplicate"),
                          onClick: () => handleDuplicate(drone),
                        },
                        {
                          label: t("coordinator.drones.actions.delete"),
                          onClick: () => setDeleteTarget(drone),
                          variant: "danger",
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* create dialog */}
      <Modal
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          resetCreateForm();
        }}
        title={t("coordinator.drones.create.title")}
      >
        <form onSubmit={handleCreate}>
          <div className="flex flex-col gap-3">
            <Input
              id="create-drone-name"
              label={t("coordinator.drones.fields.name")}
              value={createForm.name}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder={t("coordinator.drones.create.namePlaceholder")}
              required
              data-testid="create-drone-name"
            />
            <Input
              id="create-drone-speed"
              label={`${t("coordinator.drones.fields.maxSpeed")} (${t("coordinator.drones.units.ms")})`}
              type="number"
              step="any"
              value={createForm.max_speed}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, max_speed: e.target.value }))
              }
            />
            <Input
              id="create-drone-altitude"
              label={`${t("coordinator.drones.fields.maxAltitude")} (${t("coordinator.drones.units.m")})`}
              type="number"
              step="any"
              value={createForm.max_altitude}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, max_altitude: e.target.value }))
              }
            />
            <Input
              id="create-drone-endurance"
              label={`${t("coordinator.drones.fields.endurance")} (${t("coordinator.drones.units.min")})`}
              type="number"
              step="any"
              value={createForm.endurance_minutes}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  endurance_minutes: e.target.value,
                }))
              }
            />
            <Input
              id="create-drone-framerate"
              label={`${t("coordinator.drones.fields.cameraFrameRate")} (${t("coordinator.drones.units.fps")})`}
              type="number"
              step="any"
              value={createForm.camera_frame_rate}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  camera_frame_rate: e.target.value,
                }))
              }
            />
          </div>
          {createError && (
            <p className="mt-3 text-sm text-tv-error">{createError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowCreateDialog(false);
                resetCreateForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!createForm.name.trim()}>
              {t("coordinator.drones.create.add")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("coordinator.drones.delete.title")}
      >
        <p className="text-sm text-tv-text-primary mb-6">
          {t("coordinator.drones.delete.confirm", {
            name: deleteTarget?.name,
          })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </Modal>

      {/* toast notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-tv-border bg-tv-surface px-4 py-3 text-sm text-tv-text-primary">
          {notification}
        </div>
      )}
    </div>
  );
}
