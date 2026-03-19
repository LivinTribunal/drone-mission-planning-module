import { useState, useCallback } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface SaveContext {
  onSave: (() => void) | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
}

export interface MissionTabOutletContext {
  setSaveContext: (ctx: SaveContext) => void;
}

export default function MissionTabNav() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [saveCtx, setSaveCtx] = useState<SaveContext>({
    onSave: null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  });

  const setSaveContext = useCallback((ctx: SaveContext) => {
    setSaveCtx(ctx);
  }, []);

  const tabs = [
    { label: t("mission.overview"), path: "overview" },
    { label: t("mission.configuration"), path: "configuration" },
    { label: t("mission.map"), path: "map" },
    { label: t("mission.validationExport"), path: "validation-export" },
  ];

  const showSave = saveCtx.onSave !== null;

  return (
    <div>
      <div
        className="flex items-center gap-1 px-4 py-2 bg-tv-surface rounded-full mx-4 mt-4 p-1"
        data-testid="mission-tabs"
      >
        <div className="flex gap-1 flex-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/operator-center/missions/${id}/${tab.path}`}
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-tv-nav-active-bg text-tv-nav-active-text"
                    : "text-tv-text-secondary hover:bg-tv-surface-hover"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>

        {showSave && (
          <div className="flex items-center gap-3">
            {saveCtx.lastSaved && (
              <span className="text-xs text-tv-text-muted">
                {t("mission.config.saved")} {saveCtx.lastSaved}
              </span>
            )}
            <button
              onClick={() => saveCtx.onSave?.()}
              disabled={!saveCtx.isDirty || saveCtx.isSaving}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                saveCtx.isDirty && !saveCtx.isSaving
                  ? "border-tv-accent text-tv-accent hover:bg-tv-accent hover:text-tv-accent-text"
                  : "border-tv-border text-tv-text-muted opacity-50 cursor-not-allowed"
              }`}
              data-testid="save-button"
            >
              {saveCtx.isSaving
                ? t("mission.config.saving")
                : t("mission.config.save")}
            </button>
          </div>
        )}
      </div>
      <div className="p-4">
        <Outlet context={{ setSaveContext } satisfies MissionTabOutletContext} />
      </div>
    </div>
  );
}
