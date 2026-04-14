import NextImage from "@/components/next-image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import useCmsPagesService from "@/services/cms-pages";
import { IMAGE_URL } from "@/static/const";
import { getPageUrl, PageType, PAGE_TYPE_LABELS } from "@/lib/cms-page-types";

interface CmsArticleSidebarProps {
  /** The page type currently being viewed (blog or news) */
  currentType: PageType;
  /** documentId of the page being viewed — excluded from the lists */
  currentDocumentId?: string;
}

function SidebarSection({
  title,
  type,
  currentDocumentId,
}: {
  title: string;
  type: PageType;
  currentDocumentId?: string;
}) {
  const { getCmsPagesByType } = useCmsPagesService();

  const { data: pages } = useQuery({
    queryKey: ["cms-sidebar", type],
    queryFn: () => getCmsPagesByType(type),
    staleTime: 60_000,
  });

  const filtered = (pages ?? [])
    .filter((p) => p.documentId !== currentDocumentId)
    .slice(0, 5);

  if (filtered.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
        {title}
      </h3>
      <div className="space-y-4">
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={getPageUrl(p)}
            className="flex gap-3 group items-start"
          >
            {p.featured_image?.url ? (
              <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                <NextImage
                  src={IMAGE_URL + p.featured_image.url}
                  fill
                  className="object-cover"
                  alt={p.title}
                  useSkeleton
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                <span className="text-slate-400 text-lg">
                  {type === "blog" ? "✍️" : "📰"}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h4 className="text-sm font-medium leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
                {p.title}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {new Date(p.publishedAt).toLocaleDateString("en-PK", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/${type}`}
        className="inline-block text-sm text-blue-600 hover:underline mt-3"
      >
        View all {PAGE_TYPE_LABELS[type].toLowerCase()} →
      </Link>
    </div>
  );
}

export default function CmsArticleSidebar({
  currentType,
  currentDocumentId,
}: CmsArticleSidebarProps) {
  // Show the current type first, then the other type
  const otherType: PageType = currentType === "blog" ? "news" : "blog";

  return (
    <aside className="w-full">
      <SidebarSection
        title={`Recent ${PAGE_TYPE_LABELS[currentType]}`}
        type={currentType}
        currentDocumentId={currentDocumentId}
      />
      <SidebarSection
        title={`Latest ${PAGE_TYPE_LABELS[otherType]}`}
        type={otherType}
        currentDocumentId={currentDocumentId}
      />
    </aside>
  );
}
