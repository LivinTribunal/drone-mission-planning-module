import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  SortableHeader,
  Pagination,
} from "@/components/common/ListPageLayout";
import Button from "@/components/common/Button";
import type { AuditLogEntry } from "@/types/admin";
import { listAuditLogs, exportAuditLog } from "@/api/admin";

type SortKey = "timestamp" | "user_email" | "action" | "entity_type" | "entity_name";
type SortDir = "asc" | "desc";

const ACTION_OPTIONS = [
  "LOGIN",
  "LOGOUT",
  "CREATE",
  "UPDATE",
  "DELETE",
  "INVITE_USER",
  "DEACTIVATE_USER",
  "ASSIGN_AIRPORT",
  "SYSTEM_SETTING_CHANGE",
];

const ENTITY_TYPE_OPTIONS = [
  "User",
  "Airport",
  "Mission",
  "DroneProfile",
  "InspectionTemplate",
  "SystemSettings",
];

const ACTION_BADGE: Record<string, React.CSSProperties> = {
  LOGIN: { backgroundColor: "color-mix(in srgb, var(--tv-success) 20%, transparent)", color: "var(--tv-success)" },
  LOGOUT: { backgroundColor: "var(--tv-surface-hover)", color: "var(--tv-text-muted)" },
  CREATE: { backgroundColor: "color-mix(in srgb, var(--tv-accent) 20%, transparent)", color: "var(--tv-accent)" },
  UPDATE: { backgroundColor: "color-mix(in srgb, var(--tv-warning) 20%, transparent)", color: "var(--tv-warning)" },
  DELETE: { backgroundColor: "color-mix(in srgb, var(--tv-error) 20%, transparent)", color: "var(--tv-error)" },
  INVITE_USER: { backgroundColor: "color-mix(in srgb, var(--tv-info) 20%, transparent)", color: "var(--tv-info)" },
  DEACTIVATE_USER: { backgroundColor: "color-mix(in srgb, var(--tv-error) 20%, transparent)", color: "var(--tv-error)" },
  ASSIGN_AIRPORT: { backgroundColor: "color-mix(in srgb, var(--tv-info) 20%, transparent)", color: "var(--tv-info)" },
  SYSTEM_SETTING_CHANGE: { backgroundColor: "color-mix(in srgb, var(--tv-warning) 20%, transparent)", color: "var(--tv-warning)" },
};

const ENTITY_TYPE_BADGE: Record<string, React.CSSProperties> = {
  User: { backgroundColor: "color-mix(in srgb, var(--tv-info) 20%, transparent)", color: "var(--tv-info)" },
  Airport: { backgroundColor: "color-mix(in srgb, var(--tv-accent) 20%, transparent)", color: "var(--tv-accent)" },
  Mission: { backgroundColor: "color-mix(in srgb, var(--tv-warning) 20%, transparent)", color: "var(--tv-warning)" },
  DroneProfile: { backgroundColor: "color-mix(in srgb, var(--tv-success) 20%, transparent)", color: "var(--tv-success)" },
  InspectionTemplate: { backgroundColor: "var(--tv-surface-hover)", color: "var(--tv-text-primary)" },
  SystemSettings: { backgroundColor: "color-mix(in srgb, var(--tv-error) 20%, transparent)", color: "var(--tv-error)" },
};

export default function SuperAdminAuditLogPage() {
  const { t } = useTranslation();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<Set<string>>(new Set());
  const [entityTypeFilter, setEntityTypeFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogs({
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortKey,
        sort_dir: sortDir,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch {
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  async function handleExport() {
    try {
      const blob = await exportAuditLog({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export audit log");
    }
  }

  function toggleAction(action: string) {
    /**toggle an action filter pill.*/
    setActionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
    setPage(0);
  }

  function toggleEntityType(type: string) {
    /**toggle an entity type filter pill.*/
    setEntityTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setPage(0);
  }

  const filteredEntries = entries.filter((e) => {
    if (actionFilter.size > 0 && !actionFilter.has(e.action)) return false;
    if (entityTypeFilter.size > 0 && e.entity_type && !entityTypeFilter.has(e.entity_type)) return false;
    if (entityTypeFilter.size > 0 && !e.entity_type) return false;
    return true;
  });

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleString();
  }

  function formatDetails(details: Record<string, unknown> | null) {
    if (!details) return "";
    return JSON.stringify(details);
  }

  return (
    <ListPageContainer data-testid="admin-audit-log-page">
      <ListPageContent>
        <SearchBar
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t("admin.searchAuditLog")}
        >
          <Button onClick={handleExport} data-testid="export-button">
            <Download className="w-4 h-4" />
            {t("admin.exportLog")}
          </Button>
        </SearchBar>

        {/* filter row 1 - action pills */}
        <div className="flex items-center w-full max-w-6xl mb-2 rounded-full border border-tv-border bg-tv-surface px-3 py-2">
          <div className="flex items-center gap-1.5">
            {ACTION_OPTIONS.map((action) => (
              <button
                key={action}
                onClick={() => toggleAction(action)}
                style={ACTION_BADGE[action]}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-opacity ${
                  actionFilter.size > 0 && !actionFilter.has(action) ? "opacity-40" : ""
                }`}
                data-testid={`action-pill-${action}`}
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        {/* filter row 2 - entity type pills + date range */}
        <div className="flex items-center w-full max-w-6xl mb-4 rounded-full border border-tv-border bg-tv-surface px-3 py-2">
          <div className="flex items-center gap-1.5">
            {ENTITY_TYPE_OPTIONS.map((type) => (
              <button
                key={type}
                onClick={() => toggleEntityType(type)}
                style={ENTITY_TYPE_BADGE[type]}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-opacity ${
                  entityTypeFilter.size > 0 && !entityTypeFilter.has(type) ? "opacity-40" : ""
                }`}
                data-testid={`entity-type-pill-${type}`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-tv-border mx-3" />

          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="date-from"
            />
            <span className="text-xs text-tv-text-muted">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="rounded-full border border-tv-border bg-tv-bg px-3 py-1 text-xs text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="date-to"
            />
          </div>
        </div>

        {error && (
          <p className="text-center text-[var(--tv-error)] py-4">{error}</p>
        )}

        <div className="rounded-2xl border border-tv-border bg-tv-surface overflow-hidden">
          {loading ? (
            <p className="text-center text-tv-text-muted py-8">{t("common.loading")}</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center text-tv-text-muted py-8">{t("admin.noAuditLogs")}</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full" data-testid="audit-log-table">
                <thead>
                  <tr className="border-b border-tv-border">
                    <SortableHeader sortKey="timestamp" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                      {t("admin.columns.timestamp")}
                    </SortableHeader>
                    <SortableHeader sortKey="user_email" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                      {t("admin.columns.user")}
                    </SortableHeader>
                    <SortableHeader sortKey="action" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                      {t("admin.columns.action")}
                    </SortableHeader>
                    <SortableHeader sortKey="entity_type" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                      {t("admin.columns.entityType")}
                    </SortableHeader>
                    <SortableHeader sortKey="entity_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                      {t("admin.columns.entityName")}
                    </SortableHeader>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tv-text-secondary">
                      {t("admin.columns.details")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-tv-border hover:bg-tv-surface-hover transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-tv-text-secondary whitespace-nowrap">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-sm text-tv-text-primary">
                        {entry.user_email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={ACTION_BADGE[entry.action] || { backgroundColor: "var(--tv-surface-hover)", color: "var(--tv-text-primary)" }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.entity_type ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={ENTITY_TYPE_BADGE[entry.entity_type] || { backgroundColor: "var(--tv-surface-hover)", color: "var(--tv-text-secondary)" }}
                          >
                            {entry.entity_type}
                          </span>
                        ) : (
                          <span className="text-sm text-tv-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-tv-text-secondary">
                        {entry.entity_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-tv-text-muted max-w-xs truncate">
                        {formatDetails(entry.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={actionFilter.size > 0 || entityTypeFilter.size > 0 ? filteredEntries.length : total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
          showingKey="admin.pagination"
        />
      </ListPageContent>
    </ListPageContainer>
  );
}
