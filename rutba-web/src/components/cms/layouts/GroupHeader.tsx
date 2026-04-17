import { cn } from "@/lib/utils";
import { marked } from "marked";
import Link from "next/link";

type SortOption = "default" | "newest" | "price_asc" | "price_desc";
type ViewMode = "summary" | "detailed";

interface GroupHeaderProps {
  name: string;
  excerpt?: string;
  sort?: SortOption;
  onSortChange?: (v: SortOption) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  showSort?: boolean;
  showViewToggle?: boolean;
  viewAllHref?: string;
  totalProducts?: number;
}

const SORT_LABELS: Record<SortOption, string> = {
  default: "Default",
  newest: "Newest",
  price_asc: "Price: Low → High",
  price_desc: "Price: High → Low",
};

export default function GroupHeader({
  name,
  excerpt,
  sort = "default",
  onSortChange,
  viewMode = "summary",
  onViewModeChange,
  showSort = false,
  showViewToggle = false,
  viewAllHref,
  totalProducts,
}: GroupHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            {name}
          </h2>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap transition-colors"
            >
              View All{totalProducts ? ` (${totalProducts})` : ""} →
            </Link>
          )}
        </div>
        {excerpt && (
          <div
            className="text-sm text-slate-500 mt-1 line-clamp-2 prose prose-sm prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: marked.parse(excerpt) as string }}
          />
        )}
      </div>

      {(showSort || showViewToggle) && (
        <div className="flex items-center gap-3 shrink-0">
          {showSort && onSortChange && (
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}

          {showViewToggle && onViewModeChange && (
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              <button
                onClick={() => onViewModeChange("summary")}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  viewMode === "summary"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
                aria-label="Summary view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
              </button>
              <button
                onClick={() => onViewModeChange("detailed")}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  viewMode === "detailed"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
                aria-label="Detailed view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { SortOption, ViewMode };
