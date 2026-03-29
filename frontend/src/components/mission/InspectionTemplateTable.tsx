import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { AGLResponse } from "@/types/airport";

type SortField = "name" | "agl" | "method" | "created";
type SortDir = "asc" | "desc";

interface InspectionTemplateTableProps {
  templates: InspectionTemplateResponse[];
  aglMap: Map<string, AGLResponse>;
  onRowClick: (id: string) => void;
}

export default function InspectionTemplateTable({
  templates,
  aglMap,
  onRowClick,
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
        case "created":
          cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [templates, sortField, sortDir, aglMap]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 inline ml-1" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 inline ml-1" />
    );
  }

  function formatMethod(method: string) {
    if (method === "ANGULAR_SWEEP") return t("coordinator.inspections.angularSweep");
    if (method === "VERTICAL_PROFILE") return t("coordinator.inspections.verticalProfile");
    return method;
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="template-table">
        <thead>
          <tr className="border-b border-tv-border text-left">
            {(
              [
                ["name", t("coordinator.inspections.columns.name")],
                ["agl", t("coordinator.inspections.columns.aglSystem")],
                ["method", t("coordinator.inspections.columns.method")],
                ["created", t("coordinator.inspections.columns.created")],
              ] as [SortField, string][]
            ).map(([field, label]) => (
              <th
                key={field}
                onClick={() => handleSort(field)}
                className="py-3 px-3 font-semibold text-tv-text-secondary cursor-pointer select-none hover:text-tv-text-primary transition-colors"
              >
                {label}
                <SortIcon field={field} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((tpl) => {
            const agl = aglMap.get(tpl.target_agl_ids[0] ?? "");
            return (
              <tr
                key={tpl.id}
                onClick={() => onRowClick(tpl.id)}
                className="border-b border-tv-border cursor-pointer hover:bg-tv-surface-hover transition-colors"
                data-testid={`template-row-${tpl.id}`}
              >
                <td className="py-3 px-3 text-tv-text-primary font-medium">
                  {tpl.name}
                </td>
                <td className="py-3 px-3 text-tv-text-secondary">
                  {agl ? `${agl.name} - ${agl.agl_type}${agl.side ? ` - ${agl.side}` : ""}` : "-"}
                </td>
                <td className="py-3 px-3">
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tv-status-draft-bg)] text-[var(--tv-status-draft-text)]">
                    {formatMethod(tpl.methods[0] ?? "")}
                  </span>
                </td>
                <td className="py-3 px-3 text-tv-text-secondary">
                  {formatDate(tpl.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
