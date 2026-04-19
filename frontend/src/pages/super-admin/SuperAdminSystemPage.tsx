import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Save, Loader2, CheckCircle, XCircle } from "lucide-react";
import {
  ListPageContainer,
  ListPageContent,
} from "@/components/common/ListPageLayout";
import type { SystemSettingsResponse, SystemSettingsUpdate } from "@/types/admin";
import { getSystemSettings, updateSystemSettings } from "@/api/admin";

export default function SuperAdminSystemPage() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getSystemSettings();
        setSettings(data);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const update: SystemSettingsUpdate = {
        maintenance_mode: settings.maintenance_mode,
        cesium_ion_token: settings.cesium_ion_token,
        elevation_api_url: settings.elevation_api_url,
      };
      const updated = await updateSystemSettings(update);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!settings?.elevation_api_url) return;
    setTestResult(null);
    try {
      const res = await fetch(settings.elevation_api_url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      setTestResult(res.ok ? "success" : "failed");
    } catch {
      setTestResult("failed");
    }
  }

  if (loading) {
    return (
      <ListPageContainer>
        <p className="text-center text-tv-text-muted py-8">{t("common.loading")}</p>
      </ListPageContainer>
    );
  }

  if (!settings) {
    return (
      <ListPageContainer>
        <p className="text-center text-tv-text-muted py-8">{t("common.error")}</p>
      </ListPageContainer>
    );
  }

  return (
    <ListPageContainer data-testid="admin-system-page">
      <ListPageContent className="space-y-8">
        {/* maintenance mode */}
        <section className="rounded-lg border border-tv-border bg-tv-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-tv-text-primary">
                {t("admin.maintenanceMode")}
              </h2>
              <p className="text-sm text-tv-text-secondary mt-1">
                {t("admin.maintenanceDescription")}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={settings.maintenance_mode}
              onClick={() =>
                setSettings({ ...settings, maintenance_mode: !settings.maintenance_mode })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.maintenance_mode ? "bg-tv-accent" : "bg-tv-surface-hover"
              }`}
              data-testid="maintenance-toggle"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.maintenance_mode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {settings.maintenance_mode && (
            <div className="mt-3 rounded-md bg-[var(--tv-warning)]/10 px-3 py-2 text-sm text-[var(--tv-warning)]">
              {t("admin.maintenanceActive")}
            </div>
          )}
        </section>

        {/* api keys */}
        <section className="rounded-lg border border-tv-border bg-tv-surface p-6 space-y-4">
          <h2 className="text-lg font-semibold text-tv-text-primary">
            {t("admin.apiKeys")}
          </h2>

          <div>
            <label className="block text-sm font-medium text-tv-text-secondary mb-1">
              {t("admin.cesiumToken")}
            </label>
            <input
              type="text"
              value={settings.cesium_ion_token}
              onChange={(e) =>
                setSettings({ ...settings, cesium_ion_token: e.target.value })
              }
              className="w-full rounded-lg border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="cesium-token-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-tv-text-secondary mb-1">
              {t("admin.elevationApiUrl")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.elevation_api_url}
                onChange={(e) =>
                  setSettings({ ...settings, elevation_api_url: e.target.value })
                }
                className="flex-1 rounded-lg border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
                data-testid="elevation-url-input"
              />
              <button
                onClick={handleTestConnection}
                className="rounded-lg border border-tv-border px-3 py-2 text-sm text-tv-text-secondary hover:text-tv-text-primary hover:border-tv-accent transition-colors"
                data-testid="test-connection-button"
              >
                {t("admin.testConnection")}
              </button>
            </div>
            {testResult && (
              <div
                className={`flex items-center gap-1 mt-2 text-sm ${
                  testResult === "success"
                    ? "text-[var(--tv-success)]"
                    : "text-[var(--tv-error)]"
                }`}
                data-testid="connection-result"
              >
                {testResult === "success" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult === "success"
                  ? t("admin.connectionSuccess")
                  : t("admin.connectionFailed")}
              </div>
            )}
          </div>
        </section>

        {/* save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-tv-accent px-6 py-2 text-sm font-medium text-tv-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
            data-testid="save-button"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? t("admin.saving") : saved ? t("admin.saved") : t("common.save")}
          </button>
        </div>
      </ListPageContent>
    </ListPageContainer>
  );
}
