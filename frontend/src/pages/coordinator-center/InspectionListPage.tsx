import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import { useAirport } from "@/contexts/AirportContext";
import { listInspectionTemplates, createInspectionTemplate } from "@/api/inspectionTemplates";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";
import type { AGLResponse } from "@/types/airport";
import type { InspectionMethod } from "@/types/enums";
import InspectionTemplateTable from "@/components/mission/InspectionTemplateTable";
import CreateTemplateDialog from "@/components/mission/CreateTemplateDialog";
import Button from "@/components/common/Button";

export default function InspectionListPage() {
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
    fetchTemplates();
  }, [fetchTemplates]);

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

  function toggleMethod(method: InspectionMethod) {
    setMethodFilter((prev) => {
      const next = new Set(prev);
      if (next.has(method)) next.delete(method);
      else next.add(method);
      return next;
    });
  }

  async function handleCreate(data: { name: string; aglId: string; method: InspectionMethod }) {
    const result = await createInspectionTemplate({
      name: data.name,
      target_agl_ids: [data.aglId],
      methods: [data.method],
    });
    setShowCreate(false);
    navigate(`/coordinator-center/inspections/${result.id}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-tv-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-tv-error">{error}</p>
        <Button onClick={fetchTemplates}>{t("common.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="p-4" data-testid="inspection-list-page">
      {/* top row - search, filters, add button */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tv-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("coordinator.inspections.searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted focus:outline-none focus:border-tv-accent transition-colors"
            data-testid="template-search"
          />
        </div>

        {/* method pill toggles */}
        <div className="flex gap-1.5">
          {(["ANGULAR_SWEEP", "VERTICAL_PROFILE"] as InspectionMethod[]).map(
            (method) => (
              <button
                key={method}
                onClick={() => toggleMethod(method)}
                className={`rounded-full px-3 py-2 text-xs font-semibold border transition-colors ${
                  methodFilter.has(method)
                    ? "bg-tv-accent text-tv-accent-text border-tv-accent"
                    : "bg-tv-surface text-tv-text-secondary border-tv-border hover:bg-tv-surface-hover"
                }`}
              >
                {method === "ANGULAR_SWEEP"
                  ? t("coordinator.inspections.angularSweep")
                  : t("coordinator.inspections.verticalProfile")}
              </button>
            ),
          )}
        </div>

        {/* agl system filter */}
        <select
          value={aglFilter}
          onChange={(e) => setAglFilter(e.target.value)}
          className="rounded-full px-4 py-2.5 text-sm border border-tv-border bg-tv-surface text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors appearance-none"
          data-testid="agl-filter"
        >
          <option value="">{t("coordinator.inspections.allAglSystems")}</option>
          {allAgls.map((agl) => (
            <option key={agl.id} value={agl.id}>
              {agl.name}
            </option>
          ))}
        </select>

        <Button onClick={() => setShowCreate(true)} data-testid="add-template-btn">
          {t("coordinator.inspections.addNew")}
        </Button>
      </div>

      {/* template table */}
      <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
        {templates.length === 0 ? (
          <p className="text-sm text-tv-text-muted py-8 text-center">
            {t("coordinator.inspections.noTemplates")}
          </p>
        ) : (
          <InspectionTemplateTable
            templates={filtered}
            aglMap={aglMap}
            onRowClick={(id) => navigate(`/coordinator-center/inspections/${id}`)}
          />
        )}
      </div>

      <CreateTemplateDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        agls={allAgls}
        onSubmit={handleCreate}
      />
    </div>
  );
}
