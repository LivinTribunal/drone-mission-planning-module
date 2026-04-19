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

export default function SuperAdminAuditLogPage() {
  const { t } = useTranslation();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        search: search || undefined,
        action: actionFilter || undefined,
        entity_type: entityTypeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, entityTypeFilter, dateFrom, dateTo, page, pageSize]);

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
  }

  const sorted = [...entries].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir * String(av).localeCompare(String(bv));
  });

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
      /* ignore */
    }
  }

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
          <div className="flex items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-full border border-tv-border bg-tv-surface px-4 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="action-filter"
            >
              <option value="">{t("admin.actionFilter")}</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-full border border-tv-border bg-tv-surface px-4 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              data-testid="entity-type-filter"
            >
              <option value="">{t("admin.entityTypeFilter")}</option>
              {ENTITY_TYPE_OPTIONS.map((et) => (
                <option key={et} value={et}>{et}</option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="rounded-full border border-tv-border bg-tv-surface px-4 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              placeholder={t("admin.dateFrom")}
              data-testid="date-from"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="rounded-full border border-tv-border bg-tv-surface px-4 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
              placeholder={t("admin.dateTo")}
              data-testid="date-to"
            />

            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-full bg-tv-accent px-4 py-2 text-sm font-medium text-tv-accent-text hover:opacity-90 transition-opacity"
              data-testid="export-button"
            >
              <Download className="w-4 h-4" />
              {t("admin.exportLog")}
            </button>
          </div>
        </SearchBar>

        {loading ? (
          <p className="text-center text-tv-text-muted py-8">{t("common.loading")}</p>
        ) : entries.length === 0 ? (
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
                {sorted.map((entry) => (
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
                      <span className="rounded-full bg-tv-surface-hover px-2 py-0.5 text-xs font-semibold text-tv-text-primary">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">
                      {entry.entity_type || "—"}
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

        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
            showingKey="admin.pagination"
          />
        )}
      </ListPageContent>
    </ListPageContainer>
  );
}
