import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import Input from "@/components/common/Input";
import type { AirportDetailResponse } from "@/types/airport";

interface AirportInfoPanelProps {
  airport: AirportDetailResponse;
  onUpdate: (data: Record<string, unknown>) => void;
}

export default function AirportInfoPanel({
  airport,
  onUpdate,
}: AirportInfoPanelProps) {
  /** collapsible editable airport metadata panel. */
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [form, setForm] = useState({
    name: airport.name,
    icao_code: airport.icao_code,
    city: airport.city ?? "",
    country: airport.country ?? "",
    elevation: airport.elevation,
  });

  function handleChange(field: string, value: string | number | null) {
    /** propagate field change to parent. */
    setForm((prev) => ({ ...prev, [field]: value }));
    onUpdate({ [field]: value });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg"
      data-testid="airport-info-panel"
    >
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 flex-1"
        >
          <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
            {t("coordinator.detail.airportInfo")}
          </span>
          <span
            className="flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold bg-tv-accent text-tv-accent-text"
          >
            {airport.icao_code}
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
        <div className="border-t border-tv-border px-3 py-2 flex flex-col gap-1.5">
          <Input
            id="airport-name"
            label={t("coordinator.createAirport.name")}
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="!px-3 !py-1.5 !text-xs"
          />
          <Input
            id="airport-icao"
            label={t("coordinator.createAirport.icaoCode")}
            value={form.icao_code}
            onChange={(e) => handleChange("icao_code", e.target.value.toUpperCase())}
            className="!px-3 !py-1.5 !text-xs"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              id="airport-city"
              label={t("coordinator.createAirport.city")}
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value || null)}
              className="!px-3 !py-1.5 !text-xs"
            />
            <Input
              id="airport-country"
              label={t("coordinator.createAirport.country")}
              value={form.country}
              onChange={(e) => handleChange("country", e.target.value || null)}
              className="!px-3 !py-1.5 !text-xs"
            />
          </div>
          <Input
            id="airport-elevation"
            label={t("coordinator.detail.airportElevation")}
            type="number"
            value={String(form.elevation)}
            onChange={(e) => {
              if (e.target.value === "") {
                handleChange("elevation", null);
              } else {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) handleChange("elevation", parsed);
              }
            }}
            className="!px-3 !py-1.5 !text-xs"
          />
        </div>
      )}
    </div>
  );
}
