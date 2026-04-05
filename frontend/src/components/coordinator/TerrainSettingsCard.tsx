import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Upload, Download, Trash2 } from "lucide-react";
import {
  uploadTerrainDEM,
  deleteTerrainDEM,
  downloadTerrainData,
} from "@/api/airports";
import type { AirportDetailResponse, TerrainCoverage } from "@/types/airport";

interface TerrainSettingsCardProps {
  airport: AirportDetailResponse;
  onUpdate: () => void;
}

type TerrainSource = "FLAT" | "DEM_UPLOAD" | "DEM_DOWNLOAD";

export default function TerrainSettingsCard({
  airport,
  onUpdate,
}: TerrainSettingsCardProps) {
  /** collapsible terrain data source selector for coordinator airport settings. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<TerrainCoverage | null>(null);
  const [pointsDownloaded, setPointsDownloaded] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSource: TerrainSource =
    airport.terrain_source === "DEM" && airport.has_dem ? "DEM_UPLOAD" : "FLAT";

  const [selected, setSelected] = useState<TerrainSource>(currentSource);

  async function handleFileUpload(file: File) {
    /** upload DEM file and refresh airport data. */
    const MAX_FILE_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(t("coordinator.terrain.maxFileSize"));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const result = await uploadTerrainDEM(airport.id, file);
      setCoverage(result.coverage);
      setPointsDownloaded(null);
      setSelected("DEM_UPLOAD");
      onUpdate();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : t("coordinator.terrain.invalidFile");
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    /** download elevation data from API and refresh airport data. */
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadTerrainData(airport.id);
      setCoverage(result.coverage);
      setPointsDownloaded(result.points_downloaded);
      setSelected("DEM_DOWNLOAD");
      onUpdate();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : t("coordinator.terrain.downloadFailed");
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemove() {
    /** remove DEM and revert to flat terrain. */
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      await deleteTerrainDEM(airport.id);
      setCoverage(null);
      setPointsDownloaded(null);
      setSelected("FLAT");
      onUpdate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("coordinator.terrain.removeFailed");
      setError(msg);
    } finally {
      setRemoving(false);
    }
  }

  async function handleRadioChange(source: TerrainSource) {
    /** handle radio selection change. */
    setError(null);

    if (source === "FLAT" && airport.terrain_source === "DEM") {
      await handleRemove();
    } else {
      setSelected(source);
    }
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="terrain-settings-card"
    >
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 flex-1"
        >
          <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
            {t("coordinator.terrain.title")}
          </span>
        </button>
        <button onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-tv-text-muted" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-tv-border px-3 py-2 flex flex-col gap-2">
          <p className="text-[10px] text-tv-text-muted">
            {t("coordinator.terrain.description")}
          </p>

          {/* flat option */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="terrain-source"
              checked={selected === "FLAT"}
              onChange={() => handleRadioChange("FLAT")}
              className="mt-0.5 accent-tv-accent"
            />
            <div>
              <p className="text-xs font-medium text-tv-text-primary">
                {t("coordinator.terrain.flat")}
              </p>
              <p className="text-[10px] text-tv-text-muted">
                {t("coordinator.terrain.flatDescription")}
              </p>
            </div>
          </label>

          {/* upload DEM option */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="terrain-source"
              checked={selected === "DEM_UPLOAD"}
              onChange={() => handleRadioChange("DEM_UPLOAD")}
              className="mt-0.5 accent-tv-accent"
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-tv-text-primary">
                {t("coordinator.terrain.uploadDem")}
              </p>
              <p className="text-[10px] text-tv-text-muted">
                {t("coordinator.terrain.uploadDemDescription")}
              </p>
            </div>
          </label>

          {selected === "DEM_UPLOAD" && (
            <div className="ml-5 flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".tif,.tiff"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              {airport.terrain_source === "DEM" && airport.has_dem ? (
                <button
                  onClick={handleRemove}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-tv-error border border-tv-error/30 hover:bg-tv-error/10"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("coordinator.terrain.removeDem")}
                </button>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-tv-accent border border-tv-accent/30 hover:bg-tv-accent/10 disabled:opacity-50"
                >
                  <Upload className="h-3 w-3" />
                  {uploading
                    ? t("coordinator.terrain.uploading")
                    : t("coordinator.terrain.uploadDem")}
                </button>
              )}
              <p className="text-[10px] text-tv-text-muted">
                {t("coordinator.terrain.maxFileSize")}
              </p>
            </div>
          )}

          {/* download from API option */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="terrain-source"
              checked={selected === "DEM_DOWNLOAD"}
              onChange={() => handleRadioChange("DEM_DOWNLOAD")}
              className="mt-0.5 accent-tv-accent"
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-tv-text-primary">
                {t("coordinator.terrain.downloadApi")}
              </p>
              <p className="text-[10px] text-tv-text-muted">
                {t("coordinator.terrain.downloadApiDescription")}
              </p>
            </div>
          </label>

          {selected === "DEM_DOWNLOAD" && (
            <div className="ml-5 flex flex-col gap-1.5">
              {airport.terrain_source === "DEM" && airport.has_dem ? (
                <button
                  onClick={handleRemove}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-tv-error border border-tv-error/30 hover:bg-tv-error/10"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("coordinator.terrain.removeCache")}
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-tv-accent border border-tv-accent/30 hover:bg-tv-accent/10 disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  {downloading
                    ? t("coordinator.terrain.downloading")
                    : t("coordinator.terrain.downloadApi")}
                </button>
              )}
            </div>
          )}

          {/* coverage info */}
          {coverage && (
            <div className="rounded-xl border border-tv-border bg-tv-surface px-2 py-1.5 text-[10px] text-tv-text-secondary">
              <p>
                <span className="font-medium">
                  {t("coordinator.terrain.coverage")}:
                </span>{" "}
                [{coverage.bounds.map((b) => b.toFixed(4)).join(", ")}]
              </p>
              <p>
                <span className="font-medium">
                  {t("coordinator.terrain.resolution")}:
                </span>{" "}
                {coverage.resolution.map((r) => r.toFixed(5)).join(" x ")}°
              </p>
              {pointsDownloaded !== null && (
                <p>
                  <span className="font-medium">
                    {t("coordinator.terrain.pointsDownloaded")}:
                  </span>{" "}
                  {pointsDownloaded.toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* error message */}
          {error && (
            <p className="text-[10px] text-tv-error">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
