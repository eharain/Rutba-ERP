import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import NextImage from "@/components/next-image";
import { CmsPageGroupInterface, CmsPageInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import { resolveMediaUrl } from "@/lib/media-url";
import { renderMarkdown } from "@/lib/render-markdown";
import { cn } from "@/lib/utils";

// columns → responsive grid classes (static strings so Tailwind JIT keeps them)
const COLUMN_CLASSES: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

function PageFace({ page }: { page: CmsPageInterface }) {
  return (
    <>
      {page.featured_image?.url ? (
        <NextImage
          src={resolveMediaUrl(page.featured_image.url)}
          fill
          className="object-cover transition-transform duration-700 ease-smooth"
          alt={page.title}
          useSkeleton
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
          <span className="font-display text-6xl text-muted-foreground/40">
            {page.title.charAt(0)}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {page.page_type && (
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/80">
            {page.page_type}
          </span>
        )}
        <h3 className="font-display text-lg font-bold text-white leading-tight drop-shadow-sm">
          {page.title}
        </h3>
      </div>
    </>
  );
}

function FlipCard({ page }: { page: CmsPageInterface }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flip-card aspect-[3/4] rounded-2xl shadow-card hover:shadow-card-hover transition-shadow duration-300 ease-smooth">
      <div className={cn("flip-card-inner rounded-2xl", flipped && "is-flipped")}>
        {/* Front — image + title. Button so touch users can flip without navigating. */}
        <button
          type="button"
          onClick={() => setFlipped((v) => !v)}
          aria-label={`Show details for ${page.title}`}
          className="flip-card-face rounded-2xl bg-secondary text-left"
        >
          <PageFace page={page} />
        </button>

        {/* Back — excerpt + open link. */}
        <div className="flip-card-back flip-card-face rounded-2xl bg-foreground text-background flex flex-col p-5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-background/60">
            {page.page_type || "Page"}
          </span>
          <h3 className="font-display text-xl font-bold mt-1.5 leading-tight">
            {page.title}
          </h3>
          {page.excerpt && (
            <div
              className="text-sm text-background/75 mt-3 line-clamp-5 prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(page.excerpt) }}
            />
          )}
          <Link
            href={getPageUrl(page)}
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-background hover:text-brand transition-colors"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StaticCard({ page }: { page: CmsPageInterface }) {
  return (
    <Link href={getPageUrl(page)} className="group block h-full">
      <article className="h-full flex flex-col rounded-2xl overflow-hidden bg-card border border-border shadow-card hover:shadow-card-hover transition-shadow duration-300 ease-smooth">
        <div className="relative w-full aspect-[16/10] bg-secondary overflow-hidden">
          {page.featured_image?.url ? (
            <NextImage
              src={resolveMediaUrl(page.featured_image.url)}
              fill
              className="object-cover transition-transform duration-700 ease-smooth group-hover:scale-105"
              alt={page.title}
              useSkeleton
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
              <span className="font-display text-5xl text-muted-foreground/40">
                {page.title.charAt(0)}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col p-5">
          {page.page_type && (
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-brand">
              {page.page_type}
            </span>
          )}
          <h3 className="font-display text-xl font-bold mt-1.5 group-hover:text-brand transition-colors">
            {page.title}
          </h3>
          {page.excerpt && (
            <div
              className="text-sm text-muted-foreground mt-2 line-clamp-2 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(page.excerpt) }}
            />
          )}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
            Read more
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </article>
    </Link>
  );
}

export default function CmsPageGroup({ group }: { group: CmsPageGroupInterface }) {
  const pages = (group.pages ?? []).filter((p) => p.slug && p.page_type);
  if (pages.length === 0) return null;

  const layout = group.layout ?? "flip-grid";
  const colClass = COLUMN_CLASSES[group.columns ?? 3] ?? COLUMN_CLASSES[3];

  return (
    <section className="py-16 md:py-20">
      <div className="container-fluid">
        <div className="mb-8">
          <p className="eyebrow mb-2">{group.name}</p>
          {group.title && (
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              {group.title}
            </h2>
          )}
          {group.excerpt && (
            <div
              className="mt-3 max-w-2xl text-muted-foreground prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(group.excerpt) }}
            />
          )}
        </div>

        {layout === "carousel" ? (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory [scrollbar-width:thin]">
            {pages.map((p) => (
              <div key={p.id} className="snap-start shrink-0 w-[240px] md:w-[280px]">
                <FlipCard page={p} />
              </div>
            ))}
          </div>
        ) : layout === "grid" ? (
          <div className={cn("grid gap-5", colClass)}>
            {pages.map((p) => (
              <StaticCard key={p.id} page={p} />
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-5", colClass)}>
            {pages.map((p) => (
              <FlipCard key={p.id} page={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
