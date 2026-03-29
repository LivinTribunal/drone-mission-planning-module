import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import {
  listInspectionTemplates,
  createInspectionTemplate,
  deleteInspectionTemplate,
} from "@/api/inspectionTemplates";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { AGLResponse } from "@/types/airport";
import type { InspectionMethod } from "@/types/enums";
import InspectionTemplateTable from "@/components/mission/InspectionTemplateTable";
import CreateTemplateDialog from "@/components/mission/CreateTemplateDialog";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";

/** build page indices with ellipsis when there are many pages. */
function paginationRange(total: number, current: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | "...")[] = [0];
  const start = Math.max(1, current - 1);
  const end = Math.min(total - 2, current + 1);
  if (start > 1) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push("...");
  pages.push(total - 1);
  return pages;
}

export default function InspectionListPage() {
  /**inspection template list page, styled like the missions list page.*/
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { airportDetail } = useAirport();

  const [templates, setTemplates] = useState<InspectionTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<Set<InspectionMethod>>(new Set());
  const [aglFilter, setAglFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<InspectionTemplateResponse | null>(null);

  // notification toast
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotif(msg: string) {
    /**show a temporary notification toast.*/
    setNotification(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  // all agls from airport
  const allAgls = useMemo(() => {
    if (!airportDetail) return [];
    return airportDetail.surfaces.flatMap((s) => s.agls);
  }, [airportDetail]);

  const aglMap = useMemo(
    () => new Map<string, AGLResponse>(allAgls.map((a) => [a.id, a])),
    [allAgls],
  );

  const fetchTemplates = useCallback(async () => {
    /**fetch templates for the selected airport.*/
    setLoading(true);
    setError(null);
    try {
      const res = await listInspectionTemplates(
        airportDetail ? { airport_id: airportDetail.id } : undefined,
      );
      setTemplates(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coordinator.inspections.loadError"));
    } finally {
      setLoading(false);
    }
  }, [airportDetail, t]);

  useEffect(() => {
    if (airportDetail) fetchTemplates();
  }, [fetchTemplates, airportDetail]);

  // filtered templates
  const filtered = useMemo(() => {
    let list = templates;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((tpl) => tpl.name.toLowerCase().includes(q));
    }

    if (methodFilter.size > 0) {
      list = list.filter((tpl) =>
        tpl.methods.some((m) => methodFilter.has(m as InspectionMethod)),
      );
    }

    if (aglFilter) {
      list = list.filter((tpl) => tpl.target_agl_ids.includes(aglFilter));
    }

    return list;
  }, [templates, search, methodFilter, aglFilter]);

  // reset page when filters change
  useEffect(() => { setPage(1); }, [search, methodFilter, aglFilter]);

  function toggleMethod(method: InspectionMethod) {
    /**toggle a method filter pill.*/
    setMethodFilter((prev) => {
      const next = new Set(prev);
      if (next.has(method)) next.delete(method);
      else next.add(method);
      return next;
    });
  }

  async function handleCreate(data: { name: string; aglId: string; method: InspectionMethod }) {
    /**create a new template and navigate to it.*/
    try {
      const result = await createInspectionTemplate({
        name: data.name,
        target_agl_ids: [data.aglId],
        methods: [data.method],
      });
      setShowCreate(false);
      navigate(`/coordinator-center/inspections/${result.id}`);
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.createError"));
    }
  }

  async function handleDuplicate(id: string) {
    /**duplicate a template and navigate to the copy.*/
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    try {
      const result = await createInspectionTemplate({
        name: `${tpl.name} (Copy)`,
        target_agl_ids: tpl.target_agl_ids,
        methods: tpl.methods,
      });
      navigate(`/coordinator-center/inspections/${result.id}`);
    } catch (err) {
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.duplicateError"));
    }
  }

  function handleDeleteClick(id: string) {
    /**open delete confirmation for a template.*/
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setDeleteTarget(tpl);
  }

  async function handleDeleteConfirm() {
    /**confirm and execute template deletion.*/
    if (!deleteTarget) return;
    try {
      await deleteInspectionTemplate(deleteTarget.id);
      setDeleteTarget(null);
      fetchTemplates();
    } catch (err) {
      setDeleteTarget(null);
      showNotif(err instanceof Error ? err.message : t("coordinator.inspections.deleteError"));
    }
  }

  // airport guard
  if (!airportDetail) {
    return (
      <div className="flex items-center justify-center h-full bg-tv-bg" data-testid="inspection-list-page">
        <p className="text-sm text-tv-text-muted">
          {t("coordinator.inspections.selectAirportFirst")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-12" data-testid="inspection-list-page">
      {/* search bar */}
      <div className="flex items-center gap-3 w-full max-w-5xl mb-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-tv-accent flex-shrink-0">
          <svg className="h-5 w-5 text-tv-accent-text" viewBox="0 0 20 20" fill="currentColor">
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
          placeholder={t("coordinator.inspections.searchPlaceholder")}
          className="flex-1 rounded-full border border-tv-border bg-tv-surface px-5 py-2.5
            text-sm text-tv-text-primary placeholder:text-tv-text-muted
            focus:outline-none focus:border-tv-accent"
          data-testid="template-search"
        />
        <Button onClick={() => setShowCreate(true)} data-testid="add-template-btn">
          {t("coordinator.inspections.addNew")}
        </Button>
      </div>

      {/* filter row */}
      <div className="flex items-center w-full max-w-5xl mb-4 rounded-full border border-tv-border bg-tv-surface px-3 py-2">
        {/* method pills */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => toggleMethod("ANGULAR_SWEEP")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors bg-[var(--tv-method-angular-sweep-bg)] text-[var(--tv-method-angular-sweep-text)] ${
              !methodFilter.has("ANGULAR_SWEEP") ? "opacity-40" : ""
            }`}
          >
            {t("coordinator.inspections.angularSweep")}
          </button>
          <button
            onClick={() => toggleMethod("VERTICAL_PROFILE")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors bg-[var(--tv-method-vertical-profile-bg)] text-[var(--tv-method-vertical-profile-text)] ${
              !methodFilter.has("VERTICAL_PROFILE") ? "opacity-40" : ""
            }`}
          >
            {t("coordinator.inspections.verticalProfile")}
          </button>
        </div>

        <div className="w-px h-6 bg-tv-border mx-3" />

        {/* agl system filter */}
        <div className="ml-auto">
          <select
            value={aglFilter}
            onChange={(e) => setAglFilter(e.target.value)}
            className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs
              text-tv-text-primary focus:outline-none focus:border-tv-accent"
            data-testid="agl-filter"
          >
            <option value="">{t("coordinator.inspections.allAglSystems")}</option>
            {allAgls.map((agl) => (
              <option key={agl.id} value={agl.id}>
                {agl.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* template table */}
      <div className="w-full max-w-5xl rounded-2xl border border-tv-border bg-tv-surface overflow-hidden p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-tv-text-muted" />
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-tv-error">
            {error}
            <button onClick={fetchTemplates} className="ml-2 underline hover:no-underline">
              {t("common.retry")}
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {t("coordinator.inspections.noTemplates")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-tv-text-muted">
            {t("coordinator.inspections.noMatch")}
          </div>
        ) : (
          <InspectionTemplateTable
            templates={filtered}
            aglMap={aglMap}
            onRowClick={(id) => navigate(`/coordinator-center/inspections/${id}`)}
            onDuplicate={handleDuplicate}
            onDelete={handleDeleteClick}
            page={page}
            pageSize={pageSize}
          />
        )}
      </div>

      {/* pagination - outside the table container */}
      {!loading && !error && filtered.length > 0 && (
        <div className="relative flex items-center justify-between w-full max-w-5xl pt-3">
          <span className="absolute left-1/2 -translate-x-1/2 text-xs text-tv-text-secondary">
            {t("coordinator.inspections.showing", {
              from: filtered.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, filtered.length),
              total: filtered.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            {([10, 20, 50, 200] as const).map((size) => (
              <button
                key={size}
                onClick={() => { setPageSize(size); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  pageSize === size
                    ? "bg-tv-accent text-tv-accent-text"
                    : "bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {paginationRange(
              Math.max(1, Math.ceil(filtered.length / pageSize)),
              page - 1,
            ).map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-tv-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage((item as number) + 1)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    page - 1 === item
                      ? "bg-tv-accent text-tv-accent-text"
                      : "bg-tv-surface-hover text-tv-text-secondary hover:text-tv-text-primary"
                  }`}
                >
                  {(item as number) + 1}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <CreateTemplateDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        agls={allAgls}
        onSubmit={handleCreate}
      />

      {/* delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("coordinator.inspections.deleteTemplate")}
      >
        <p className="text-sm text-tv-text-secondary mb-4">
          {t("coordinator.inspections.deleteConfirm", { name: deleteTarget?.name ?? "" })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            {t("common.delete")}
          </Button>
        </div>
      </Modal>

      {/* notification toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-tv-surface border border-tv-border text-sm text-tv-text-primary">
          {notification}
        </div>
      )}
    </div>
  );
}
