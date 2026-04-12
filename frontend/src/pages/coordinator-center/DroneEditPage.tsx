import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDroneProfile,
  listDroneProfiles,
  createDroneProfile,
  updateDroneProfile,
  deleteDroneProfile,
  uploadDroneModel,
} from "@/api/droneProfiles";
import { listMissions } from "@/api/missions";
import type {
  DroneProfileResponse,
  DroneProfileUpdate,
} from "@/types/droneProfile";
import type { MissionResponse } from "@/types/mission";
import { Layers, Clock, Pencil, Plus, Copy, Trash2, X, Link } from "lucide-react";
import Badge from "@/components/common/Badge";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import DetailSelector from "@/components/common/DetailSelector";
import DetailSelectorItem from "@/components/common/DetailSelectorItem";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import DroneModelViewer from "@/components/drone/DroneModelViewer";
import { BUNDLED_DRONE_MODELS, getBundledModel } from "@/config/droneModels";
import type { MissionStatus } from "@/types/enums";

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

const AUTOSAVE_DELAY = 1500;

/** convert drone response to form values. */
function droneToForm(drone: DroneProfileResponse): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of FIELDS) {
    const val = drone[f.key];
    form[f.key] = val != null ? String(val) : "";
  }
  return form;
}

/** convert form values to api payload. */
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
  return payload as DroneProfileUpdate;
}

/** format a date as a human-readable saved timestamp. */
function formatTimestamp(
  date: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t("coordinator.drones.detail.savedJustNow");
  if (diffMin < 60)
    return t("coordinator.drones.detail.savedMinutesAgo", { count: diffMin });

  return t("coordinator.drones.detail.savedAt", {
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
}

/** format an iso date string for display in the dropdown. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** format seconds as m:ss duration string. */
function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** chevron icon that rotates when expanded. */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface ModelSelectorOverlayProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onRemoveModel: () => void;
  onUploadCustom?: (file: File) => void;
  onInvalidFile?: (message: string) => void;
}

/** compact model selector dropdown overlaid on the 3d viewer. */
function ModelSelectorOverlay({
  selectedModelId,
  onSelectModel,
  onRemoveModel,
  onUploadCustom,
  onInvalidFile,
}: ModelSelectorOverlayProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedModel = selectedModelId
    ? getBundledModel(selectedModelId)
    : null;
  const displayLabel = selectedModel?.name ?? (selectedModelId ? t("drone.customModel") : t("drone.noModelAssigned"));

  /** handle custom file upload. */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "glb" && ext !== "gltf") {
      onInvalidFile?.(t("drone.invalidFileType"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    onUploadCustom?.(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOpen(false);
  }

  return (
    <div ref={ref} className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
      {/* model dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
            bg-[var(--tv-surface)]/90 backdrop-blur-sm border border-[var(--tv-border)]
            text-[var(--tv-text-primary)] hover:bg-[var(--tv-surface-hover)] transition-colors"
          data-testid="model-dropdown-trigger"
        >
          <span className="max-w-[140px] truncate">{displayLabel}</span>
          <svg
            className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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

        {open && (
          <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-2xl border border-[var(--tv-border)] bg-[var(--tv-surface)] p-1.5 z-50 shadow-lg">
            {BUNDLED_DRONE_MODELS.map((model) => {
              const isSelected = selectedModelId === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelectModel(model.id);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full rounded-xl px-3 py-2 text-xs transition-colors ${isSelected
                      ? "bg-[var(--tv-nav-active-bg)] text-[var(--tv-nav-active-text)]"
                      : "text-[var(--tv-text-primary)] hover:bg-[var(--tv-surface-hover)]"
                    }`}
                  data-testid={`model-option-${model.id}`}
                >
                  <img
                    src={model.thumbnail}
                    alt={model.name}
                    className="h-7 w-7 rounded-md object-cover flex-shrink-0"
                  />
                  <span className="truncate">{model.name}</span>
                </button>
              );
            })}

            {selectedModelId && (
              <>
                <div className="mx-2 my-1 border-t border-[var(--tv-border)]" />
                <button
                  onClick={() => {
                    onRemoveModel();
                    setOpen(false);
                  }}
                  className="w-full text-left rounded-xl px-3 py-2 text-xs text-[var(--tv-text-muted)] hover:bg-[var(--tv-surface-hover)] transition-colors"
                  data-testid="remove-model-option"
                >
                  {t("drone.removeModel")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* add model (upload) button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium
          bg-[var(--tv-accent)] text-[var(--tv-accent-text)] hover:bg-[var(--tv-accent-hover)] transition-colors"
        title={t("drone.addModel")}
        data-testid="add-model-button"
      >
        <Plus className="h-3 w-3" />
        <span>{t("drone.addModel")}</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        onChange={handleFileChange}
        className="hidden"
        data-testid="model-file-input"
      />
    </div>
  );
}

/** drone profile editor with autosave. */
export default function DroneEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [drone, setDrone] = useState<DroneProfileResponse | null>(null);
  const [allDrones, setAllDrones] = useState<DroneProfileResponse[]>([]);
  const [missions, setMissions] = useState<MissionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState("");
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nameError, setNameError] = useState("");

  // autosave state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFormRef = useRef<Record<string, string>>({});
  const droneRef = useRef<DroneProfileResponse | null>(null);

  // tick for relative timestamp display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");

  // delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // drone selector
  const [showSelector, setShowSelector] = useState(false);
  const [droneSearch, setDroneSearch] = useState("");

  // inline rename
  const [isRenamingDrone, setIsRenamingDrone] = useState(false);
  const [renameDroneValue, setRenameDroneValue] = useState("");

  // collapsible mission list
  const [missionsExpanded, setMissionsExpanded] = useState(true);

  // filtered drones for search
  const filteredDrones = droneSearch
    ? allDrones.filter((d) =>
      d.name.toLowerCase().includes(droneSearch.toLowerCase()),
    )
    : allDrones;

  // sum of mission durations for the selected drone
  const totalDuration = missions.reduce(
    (sum, m) => sum + (m.estimated_duration ?? 0),
    0,
  );

  const performSave = useCallback(
    async (form: Record<string, string>) => {
      /** save the current form data to the backend. */
      if (!id || !droneRef.current) return;
      if (!form.name?.trim()) return;

      setSaving(true);
      setSaveError(false);
      try {
        const updated = await updateDroneProfile(id, formToPayload(form));
        setDrone(updated);
        droneRef.current = updated;
        setLastSaved(new Date());
        setSaveError(false);
      } catch (err) {
        console.error("autosave failed", err);
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  /** schedule an autosave after debounce delay. */
  function scheduleAutosave(form: Record<string, string>) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      performSave(form);
    }, AUTOSAVE_DELAY);
  }

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  // cancel pending autosave on page unload
  useEffect(() => {
    function handleBeforeUnload() {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  /** fetch drone profile, all drones list, and missions using this drone. */
  const fetchDrone = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    Promise.all([
      getDroneProfile(id),
      listDroneProfiles({ limit: 200 }),
      listMissions({ drone_profile_id: id, limit: 200 }),
    ])
      .then(([droneData, listData, missionsData]) => {
        setDrone(droneData);
        droneRef.current = droneData;
        setAllDrones(listData.data);
        setMissions(missionsData.data);
        const form = droneToForm(droneData);
        setFormData(form);
        latestFormRef.current = form;
        setLastSaved(new Date(droneData.updated_at));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDrone();
  }, [fetchDrone]);

  /** show a temporary toast notification. */
  function showToast(msg: string) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(""), 3000);
  }

  /** handle field value change and schedule autosave. */
  function handleFieldChange(key: string, value: string) {
    if (key === "name") setNameError("");
    const next = { ...formData, [key]: value };
    setFormData(next);
    latestFormRef.current = next;

    if (!droneRef.current) return;
    const orig = droneToForm(droneRef.current);
    const dirty = FIELDS.some((f) => next[f.key] !== orig[f.key]);
    if (dirty) {
      scheduleAutosave(next);
    } else {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    }
  }

  /** navigate to a different drone profile. */
  function handleSelectDrone(droneId: string) {
    setShowSelector(false);
    setDroneSearch("");
    if (droneId === id) return;
    // flush pending save before navigating
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      const orig = droneRef.current ? droneToForm(droneRef.current) : {};
      const dirty = FIELDS.some(
        (f) => latestFormRef.current[f.key] !== orig[f.key],
      );
      if (dirty && latestFormRef.current.name?.trim()) {
        performSave(latestFormRef.current);
      }
    }
    navigate(`/coordinator-center/drones/${droneId}`);
  }

  /** duplicate the current drone profile. */
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
        model_identifier: drone.model_identifier,
      };
      const created = await createDroneProfile(payload);
      navigate(`/coordinator-center/drones/${created.id}`);
    } catch (err) {
      console.error("duplicate failed", err);
      showToast(t("coordinator.drones.duplicate.error"));
    }
  }

  /** toggle the drone selector dropdown. */
  function handleSelectorToggle() {
    setShowSelector((prev) => {
      if (prev) setDroneSearch("");
      return !prev;
    });
  }

  /** start inline rename of the drone profile. */
  function startDroneRename() {
    if (!drone) return;
    setRenameDroneValue(drone.name);
    setIsRenamingDrone(true);
  }

  /** finish inline rename and persist to backend. */
  async function finishDroneRename() {
    setIsRenamingDrone(false);
    if (!id || !drone || !renameDroneValue.trim() || renameDroneValue.trim() === drone.name) return;
    try {
      const result = await updateDroneProfile(id, { name: renameDroneValue.trim() });
      setDrone(result);
      droneRef.current = result;
      const refreshed = await listDroneProfiles();
      setAllDrones(refreshed.data);
    } catch (err) {
      console.error("rename failed", err);
      showToast(t("coordinator.drones.detail.renameError") ?? "Rename failed");
    }
  }

  /** delete the current drone profile. */
  async function handleDelete() {
    if (!id) return;
    try {
      await deleteDroneProfile(id);
      setShowDeleteDialog(false);
      navigate("/coordinator-center/drones");
    } catch (err) {
      console.error("delete failed", err);
      showToast(t("coordinator.drones.delete.deleteError"));
    }
  }

  /** create a new drone profile from the dialog form. */
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
    } catch (err) {
      console.error("create failed", err);
      setCreateError(t("coordinator.drones.create.createError"));
    }
  }

  /** resolve model identifier to a loadable url. */
  function resolveModelUrl(identifier: string | null): string | null {
    if (!identifier) return null;
    const bundled = getBundledModel(identifier);
    if (bundled) return bundled.path;
    return `/static/models/custom/${identifier}`;
  }

  /** select a bundled model and save immediately. */
  async function handleSelectModel(modelId: string) {
    if (!id || !drone) return;
    try {
      const updated = await updateDroneProfile(id, {
        model_identifier: modelId,
      });
      setDrone(updated);
      droneRef.current = updated;
      setLastSaved(new Date());
    } catch (err) {
      console.error("select model failed", err);
      showToast(t("coordinator.drones.detail.saveError"));
    }
  }

  /** remove the model selection. */
  async function handleRemoveModel() {
    if (!id || !drone) return;
    try {
      const updated = await updateDroneProfile(id, {
        model_identifier: null,
      });
      setDrone(updated);
      droneRef.current = updated;
      setLastSaved(new Date());
    } catch (err) {
      console.error("remove model failed", err);
      showToast(t("coordinator.drones.detail.saveError"));
    }
  }

  /** upload a custom model file. */
  async function handleUploadCustomModel(file: File) {
    if (!id) return;
    try {
      const result = await uploadDroneModel(id, file);
      setDrone((prev) =>
        prev ? { ...prev, model_identifier: result.model_identifier } : prev,
      );
      if (droneRef.current) {
        droneRef.current = {
          ...droneRef.current,
          model_identifier: result.model_identifier,
        };
      }
      setLastSaved(new Date());
    } catch (err) {
      console.error("upload model failed", err);
      showToast(t("drone.invalidFileType"));
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
    <div className="flex h-full px-4 bg-tv-bg">
      {/* left panel - 30% matching navbar app title width */}
      <div className="w-[30%] flex-shrink-0 flex">
        <div
          className="flex-1 flex flex-col gap-4 min-h-0 pb-4"
          style={{ scrollbarGutter: "stable" }}
        >
          {/* drone selector */}
          <DetailSelector
            title={t("coordinator.drones.title")}
            count={allDrones.length}
            actions={[
              { icon: Plus, onClick: () => { setShowCreateDialog(true); setCreateName(""); setCreateError(""); }, title: t("coordinator.drones.detail.addNew"), variant: "accent" },
              { icon: Copy, onClick: handleDuplicate, title: t("coordinator.drones.detail.duplicate") },
              { icon: Pencil, onClick: startDroneRename, title: t("coordinator.drones.detail.rename") },
              { icon: Trash2, onClick: () => setShowDeleteDialog(true), title: t("coordinator.drones.detail.delete"), variant: "danger" },
              { icon: X, onClick: () => navigate("/coordinator-center/drones"), title: t("coordinator.drones.detail.backToList") },
            ]}
            renderSelected={() => (
              <>
                <span className="flex-1 text-tv-text-primary truncate font-medium">
                  {drone.name}
                </span>
                {(drone.mission_count ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-tv-text-secondary">
                    <Link className="h-3 w-3" />
                    <span className="text-xs font-medium">{drone.mission_count}</span>
                  </span>
                )}
              </>
            )}
            isOpen={showSelector}
            onToggle={handleSelectorToggle}
            isRenaming={isRenamingDrone}
            renameValue={renameDroneValue}
            onRenameChange={setRenameDroneValue}
            onRenameFinish={finishDroneRename}
            searchValue={droneSearch}
            onSearchChange={setDroneSearch}
            searchPlaceholder={t("coordinator.drones.searchPlaceholder")}
            noResultsText={t("coordinator.drones.noMatch")}
            renderDropdownItems={() =>
              filteredDrones.length === 0 ? null : filteredDrones.map((d) => {
                const isSelected = d.id === id;
                return (
                  <DetailSelectorItem
                    key={d.id}
                    isSelected={isSelected}
                    onClick={() => { handleSelectDrone(d.id); handleSelectorToggle(); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-sm">
                        {d.name}
                      </span>
                    </div>
                    <div className={`flex items-center gap-3 text-xs mt-0.5 ${isSelected ? "text-tv-accent-text/70" : "text-tv-text-muted"}`}>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {isSelected ? missions.length : d.mission_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {isSelected && totalDuration > 0 ? formatDuration(totalDuration) : "\u2014"}
                      </span>
                      <span className="ml-auto">
                        {formatDate(d.updated_at)}
                      </span>
                    </div>
                  </DetailSelectorItem>
                );
              })
            }
          />

          {/* missions panel */}
          <div className="bg-tv-surface border border-tv-border rounded-2xl flex flex-col min-h-0">
            <button
              onClick={() => setMissionsExpanded(!missionsExpanded)}
              className="flex items-center justify-between w-full px-4 py-3 flex-shrink-0"
              data-testid="missions-panel-toggle"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-tv-bg px-3 py-1 text-xs font-medium text-tv-text-secondary uppercase tracking-wider">
                  {t("coordinator.drones.detail.missions")}
                </span>
                <span className="rounded-full bg-tv-accent text-tv-accent-text px-2 py-0.5 text-xs font-semibold">
                  {missions.length}
                </span>
              </div>
              <ChevronIcon expanded={missionsExpanded} />
            </button>

            {missionsExpanded && (
              <div className="px-4 pb-3 min-h-0">
                {missions.length === 0 ? (
                  <p className="text-sm text-tv-text-muted py-2">
                    {t("coordinator.drones.detail.noMissions")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {missions.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-xl px-3 py-2 bg-tv-bg"
                      >
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-tv-text-primary truncate">
                            {m.name}
                          </span>
                          <span className="block text-xs text-tv-text-muted">
                            {t("coordinator.drones.detail.created")}{" "}
                            {formatDate(m.created_at)}
                            {" · "}
                            {t("coordinator.drones.detail.updated")}{" "}
                            {formatDate(m.updated_at)}
                          </span>
                        </div>
                        <Badge
                          status={m.status as MissionStatus}
                          className="flex-shrink-0 ml-2"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="w-6 flex-shrink-0" />
      </div>

      {/* right section - mirrors navbar right flex structure */}
      <div className="flex-1 min-w-0 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <div className="flex gap-4">

          {/* center panel - drone details (mirrors nav pills flex-1) */}
          <div className="flex-1 min-w-0">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-tv-text-primary">
                  {drone.name}
                </h2>

                {/* saved status indicator */}
                <span className="text-xs text-tv-text-muted flex items-center gap-1.5">
                  {saving && (
                    <>
                      <svg
                        className="h-3 w-3 animate-spin"
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
                      {t("coordinator.drones.detail.saving")}
                    </>
                  )}
                  {!saving && saveError && (
                    <span className="text-tv-error">
                      {t("coordinator.drones.detail.saveError")}
                    </span>
                  )}
                  {!saving && !saveError && lastSaved && (
                    <>
                      <svg
                        className="h-3 w-3 text-tv-success"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {formatTimestamp(lastSaved, t)}
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {FIELDS.map((field) => {
                  const label = t(`coordinator.drones.fields.${field.labelKey}`);
                  const unitLabel = field.unitKey
                    ? t(`coordinator.drones.units.${field.unitKey}`)
                    : "";

                  return (
                    <div key={field.key}>
                      <Input
                        id={`edit-${field.key}`}
                        label={unitLabel ? `${label} (${unitLabel})` : label}
                        type={field.type}
                        step={field.type === "number" ? "any" : undefined}
                        value={formData[field.key] ?? ""}
                        onChange={(e) =>
                          handleFieldChange(field.key, e.target.value)
                        }
                        data-testid={`edit-${field.key}`}
                      />
                      {field.key === "name" && nameError && (
                        <p
                          className="mt-1 text-sm text-tv-error"
                          data-testid="name-error"
                        >
                          {nameError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* right panel - 3d model viewer, width = airport selector + theme toggle + user dropdown + gaps */}
          <div
            className="relative flex-shrink-0 rounded-2xl border border-[var(--tv-border)] bg-[var(--tv-surface)] overflow-hidden"
            style={{ width: "calc(280px + 16px + 76px + 16px + 140px)" }}
            data-testid="model-viewer-section"
          >
            <DroneModelViewer modelUrl={resolveModelUrl(drone.model_identifier)} />

            {/* model selector overlay - top right */}
            <ModelSelectorOverlay
              selectedModelId={drone.model_identifier}
              onSelectModel={handleSelectModel}
              onRemoveModel={handleRemoveModel}
              onUploadCustom={handleUploadCustomModel}
              onInvalidFile={(msg) => showToast(msg)}
            />
          </div>

        </div> {/* end inner flex */}
      </div> {/* end right section */}

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
    </div>
  );
}
