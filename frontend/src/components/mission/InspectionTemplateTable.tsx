import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Copy, Trash2 } from "lucide-react";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { AGLResponse } from "@/types/airport";
import { methodBadgeStyle } from "@/utils/inspectionMethodBadge";

type SortField = "name" | "agl" | "method" | "usedIn" | "created" | "lastUpdated";
type SortDir = "asc" | "desc";

interface InspectionTemplateTableProps {
  templates: InspectionTemplateResponse[];
  aglMap: Map<string, AGLResponse>;
  onRowClick: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  page: number;
  pageSize: number;
}

export default function InspectionTemplateTable({
  templates,
  aglMap,
  onRowClick,
  onDuplicate,
  onDelete,
  page,
  pageSize,
}: InspectionTemplateTableProps) {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const list = [...templates];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "agl": {
          const aglA = aglMap.get(a.target_agl_ids[0] ?? "")?.name ?? "";
          const aglB = aglMap.get(b.target_agl_ids[0] ?? "")?.name ?? "";
          cmp = aglA.localeCompare(aglB);
          break;
        }
        case "method":
          cmp = (a.methods[0] ?? "").localeCompare(b.methods[0] ?? "");
          break;
        case "usedIn":
          cmp = (a.mission_count ?? 0) - (b.mission_count ?? 0);
          break;
        case "created":
          cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
          break;
        case "lastUpdated":
          cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [templates, sortField, sortDir, aglMap]);

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 inline ml-1" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 inline ml-1" />
    );
  }

  function formatMethod(method: string) {
    /**format method name for display.*/
    return t(`map.inspectionMethodShort.${method}`, method);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-tv-text-muted py-8 text-center">
        {t("coordinator.inspections.noMatch")}
      </p>
    );
  }

  const columns: [SortField, string][] = [
    ["name", t("coordinator.inspections.columns.name")],
    ["agl", t("coordinator.inspections.columns.aglSystem")],
    ["method", t("coordinator.inspections.columns.method")],
    ["usedIn", t("coordinator.inspections.columns.usedIn")],
    ["created", t("coordinator.inspections.columns.created")],
    ["lastUpdated", t("coordinator.inspections.columns.lastUpdated")],
  ];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="template-table">
          <thead>
            <tr className="border-b border-tv-border text-left">
              {columns.map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => handleSort(field)}
                  className="py-3 px-3 text-xs uppercase font-semibold text-tv-text-secondary cursor-pointer select-none hover:text-tv-text-primary transition-colors"
                >
                  {label}
                  <SortIcon field={field} />
                </th>
              ))}
              <th className="py-3 px-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((tpl) => {
              const agl = aglMap.get(tpl.target_agl_ids[0] ?? "");
              return (
                <tr
                  key={tpl.id}
                  onClick={() => onRowClick(tpl.id)}
                  className="border-b border-tv-border last:border-b-0 cursor-pointer hover:bg-tv-surface-hover transition-colors"
                  data-testid={`template-row-${tpl.id}`}
                >
                  <td className="py-3 px-3 text-tv-text-primary font-medium">
                    {tpl.name}
                  </td>
                  <td className="py-3 px-3 text-tv-text-secondary">
                    {agl ? `${agl.name}${agl.side ? ` (${agl.side.charAt(0)}${agl.side.slice(1).toLowerCase()} side)` : ""}` : "-"}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-xs"
                      style={methodBadgeStyle(tpl.methods[0] ?? "")}
                    >
                      {formatMethod(tpl.methods[0] ?? "")}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-tv-text-secondary">
                    {tpl.mission_count ?? 0}
                  </td>
                  <td className="py-3 px-3 text-tv-text-secondary">
                    {formatDate(tpl.created_at)}
                  </td>
                  <td className="py-3 px-3 text-tv-text-secondary">
                    {formatDate(tpl.updated_at)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDuplicate(tpl.id); }}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-text-secondary hover:bg-tv-text-primary/10 hover:text-tv-text-primary"
                        aria-label={t("coordinator.inspections.duplicateTemplate")}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(tpl.id); }}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-tv-text-secondary hover:bg-tv-error/15 hover:text-tv-error"
                        aria-label={t("coordinator.inspections.deleteTemplate")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
