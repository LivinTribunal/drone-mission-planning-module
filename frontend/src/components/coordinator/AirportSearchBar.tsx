import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";

interface AirportSearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  country: string;
  onCountryChange: (value: string) => void;
  countries: string[];
  hasAglFilter: boolean;
  onHasAglChange: (value: boolean) => void;
  onAddClick: () => void;
}

export default function AirportSearchBar({
  search,
  onSearchChange,
  country,
  onCountryChange,
  countries,
  hasAglFilter,
  onHasAglChange,
  onAddClick,
}: AirportSearchBarProps) {
  /** top bar with search input, filters, and add button. */
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="airport-search-bar">
      {/* search input */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("coordinator.airportList.searchPlaceholder")}
        className="flex-1 min-w-[200px] max-w-md px-4 py-2.5 rounded-full text-sm border border-tv-border
          bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
          focus:outline-none focus:border-tv-accent transition-colors"
        data-testid="airport-search-input"
      />

      {/* country filter */}
      <select
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        className="px-4 py-2.5 rounded-full text-sm border border-tv-border
          bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
        data-testid="country-filter"
      >
        <option value="">{t("coordinator.airportList.filterCountry")}</option>
        {countries.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* has agl toggle */}
      <label className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg cursor-pointer select-none">
        <input
          type="checkbox"
          checked={hasAglFilter}
          onChange={(e) => onHasAglChange(e.target.checked)}
          className="accent-tv-accent"
          data-testid="agl-filter"
        />
        <span className="text-tv-text-primary">{t("coordinator.airportList.filterHasAgl")}</span>
      </label>

      {/* add button */}
      <Button onClick={onAddClick} data-testid="add-airport-button">
        {t("coordinator.airportList.addAirport")}
      </Button>
    </div>
  );
}
