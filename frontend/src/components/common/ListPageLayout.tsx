import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export const PAGE_SIZES = [10, 20, 50, 200] as const;

/** build page indices with ellipsis when there are many pages. */
export function paginationRange(
  total: number,
  current: number,
): (number | "...")[] {
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

type SortDir = "asc" | "desc";

/** triangle indicator for sort direction. */
export function SortIndicator({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return null;
  return (
    <span className="ml-1 text-tv-accent">
      {dir === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

/** outer wrapper for all list pages - centers content with standard padding. */
export function ListPageContainer({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-6" data-testid={testId}>
      {children}
    </div>
  );
}

/** max-width content wrapper for list pages. */
export function ListPageContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full max-w-6xl ${className}`.trim()}>{children}</div>
  );
}

/** search bar with accent icon, input, and optional right-side slot. */
export function SearchBar({
  value,
  onChange,
  placeholder,
  children,
  testId,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full max-w-6xl mb-4">
      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-tv-accent flex-shrink-0">
        <svg
          className="h-5 w-5 text-tv-accent-text"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 rounded-full border border-tv-border bg-tv-surface px-5 h-10
          text-sm text-tv-text-primary placeholder:text-tv-text-muted
          focus:outline-none focus:border-tv-accent"
        data-testid={testId}
      />
      {children}
    </div>
  );
}

/** pagination controls with page size buttons, status text, and page numbers. */
export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  showingKey,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  showingKey: string;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const showFrom = totalItems === 0 ? 0 : page * pageSize + 1;
  const showTo = Math.min((page + 1) * pageSize, totalItems);

  return (
    <div className="relative flex items-center justify-between w-full max-w-6xl pt-3">
      <span className="absolute left-1/2 -translate-x-1/2 text-xs text-tv-text-secondary">
        {t(showingKey, { from: showFrom, to: showTo, total: totalItems })}
      </span>
      <div className="flex items-center gap-1">
        {PAGE_SIZES.map((size) => (
          <button
            key={size}
            onClick={() => onPageSizeChange(size)}
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
        {paginationRange(totalPages, page).map((item, idx) =>
          item === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs text-tv-text-muted"
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onPageChange(item as number)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                page === item
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
  );
}

/** sortable table header cell. */
export function SortableHeader<K extends string>({
  sortKey,
  currentSort,
  currentDir,
  onSort,
  children,
}: {
  sortKey: K;
  currentSort: K;
  currentDir: SortDir;
  onSort: (key: K) => void;
  children: ReactNode;
}) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider
        text-tv-text-secondary cursor-pointer select-none hover:text-tv-text-primary transition-colors"
    >
      {children}
      <SortIndicator active={currentSort === sortKey} dir={currentDir} />
    </th>
  );
}
