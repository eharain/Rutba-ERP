import { cn } from "@/lib/utils";
import { marked } from "marked";
import Link from "next/link";
import { ArrowRight, LayoutGrid, List } from "lucide-react";

type SortOption = "default" | "newest" | "price_asc" | "price_desc";
type ViewMode = "summary" | "detailed";

interface GroupHeaderProps {
  name: string;
  excerpt?: string;
  eyebrow?: string;
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
  default: "Featured",
  newest: "Newest",
  price_asc: "Price: Low → High",
  price_desc: "Price: High → Low",
};

export default function GroupHeader({
  name,
  excerpt,
  eyebrow,
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
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            {name}
          </h2>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-foreground transition-colors"
            >
              <span>View All{totalProducts ? ` (${totalProducts})` : ""}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
        {excerpt && (
          <div
            className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-2xl prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: marked.parse(excerpt) as string }}
          />
        )}
      </div>

      {(showSort || showViewToggle) && (
        <div className="flex items-center gap-2 shrink-0">
          {showSort && onSortChange && (
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="appearance-none text-sm border border-border rounded-full pl-4 pr-9 py-2 bg-background text-foreground hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors cursor-pointer"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}

          {showViewToggle && onViewModeChange && (
            <div className="inline-flex rounded-full border border-border bg-background p-0.5">
              <button
                onClick={() => onViewModeChange("summary")}
                className={cn(
                  "inline-flex items-center justify-center h-8 w-9 rounded-full text-sm transition-colors",
                  viewMode === "summary"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label="Grid view"
                aria-pressed={viewMode === "summary"}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange("detailed")}
                className={cn(
                  "inline-flex items-center justify-center h-8 w-9 rounded-full text-sm transition-colors",
                  viewMode === "detailed"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label="List view"
                aria-pressed={viewMode === "detailed"}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { SortOption, ViewMode };
