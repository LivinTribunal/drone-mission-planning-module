import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BUNDLED_DRONE_MODELS } from "@/config/droneModels";

interface DroneModelSelectorProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onRemoveModel: () => void;
  onUploadCustom?: (file: File) => void;
  onInvalidFile?: (message: string) => void;
  showUpload?: boolean;
}

/** thumbnail card grid for selecting a bundled or custom 3d drone model. */
export default function DroneModelSelector({
  selectedModelId,
  onSelectModel,
  onRemoveModel,
  onUploadCustom,
  onInvalidFile,
  showUpload = true,
}: DroneModelSelectorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** handle custom file selection. */
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
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {BUNDLED_DRONE_MODELS.map((model) => {
          const isSelected = selectedModelId === model.id;
          return (
            <button
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors
                ${
                  isSelected
                    ? "border-2 border-[var(--tv-accent)] bg-[var(--tv-surface)]"
                    : "border-2 border-[var(--tv-border)] hover:border-[var(--tv-text-muted)]"
                }`}
              title={model.name}
              data-testid={`model-card-${model.id}`}
            >
              <img
                src={model.thumbnail}
                alt={model.name}
                className="h-[60px] w-[60px] rounded-lg object-cover"
              />
              <span className="text-[10px] text-[var(--tv-text-secondary)] max-w-[70px] truncate">
                {model.name}
              </span>
            </button>
          );
        })}

        {/* upload custom card */}
        {showUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-1.5
              border-2 border-dashed border-[var(--tv-border)] hover:border-[var(--tv-text-muted)]
              transition-colors h-[88px] w-[76px]"
            title={t("drone.uploadCustom")}
            data-testid="upload-custom-model"
          >
            <svg
              className="h-6 w-6 text-[var(--tv-text-muted)]"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[10px] text-[var(--tv-text-muted)]">
              {t("drone.uploadCustom")}
            </span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf"
          onChange={handleFileChange}
          className="hidden"
          data-testid="model-file-input"
        />
      </div>

      {/* remove model link */}
      {selectedModelId && (
        <button
          onClick={onRemoveModel}
          className="mt-2 text-xs text-[var(--tv-text-muted)] hover:text-[var(--tv-text-secondary)] transition-colors"
          data-testid="remove-model"
        >
          {t("drone.removeModel")}
        </button>
      )}
    </div>
  );
}
