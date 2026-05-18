import NextImage from "@/components/next-image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CmsPageDetailInterface, CmsProductGroupInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import ProductGroupRenderer from "./ProductGroupRenderer";
import CmsContactFormSection from "./cms-contact-form-section";
import Seo from "@/components/seo/seo";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/render-markdown";
import { resolveMediaUrl } from "@/lib/media-url";

export default function CmsPageContent({
  page,
}: {
  page: CmsPageDetailInterface;
}) {
  // Strapi returns relations in _ord order; preserve that, drop accidental dupes.
  const productGroups: CmsProductGroupInterface[] = [];
  {
    const seen = new Set<string>();
    for (const g of page.product_groups ?? []) {
      if (!seen.has(g.documentId)) {
        seen.add(g.documentId);
        productGroups.push(g);
      }
    }
  }

  const bgUrl = page.background_image?.url
    ? resolveMediaUrl(page.background_image.url)
    : null;

  type Section =
    | { type: "product-groups"; priority: number; key: string }
    | { type: "featured-image"; priority: number; key: string }
    | { type: "excerpt"; priority: number; key: string }
    | { type: "content"; priority: number; key: string }
    | { type: "gallery"; priority: number; key: string }
    | { type: "related-pages"; priority: number; key: string };

  // The CMS Section Priorities list assigns each visible section a small
  // integer (0..N). Sort sections by that and render; product groups render
  // as a single block at their slot (groups themselves keep their _ord order
  // from the editor's drag-sortable connected list).
  const sections: Section[] = [];

  if (page.featured_image?.url) {
    sections.push({
      type: "featured-image",
      priority: page.featured_image_priority ?? 0,
      key: "featured-image",
    });
  }
  if (page.excerpt) {
    sections.push({
      type: "excerpt",
      priority: page.excerpt_priority ?? 1,
      key: "excerpt",
    });
  }
  if (page.content) {
    sections.push({
      type: "content",
      priority: page.content_priority ?? 2,
      key: "content",
    });
  }
  if (productGroups.length > 0) {
    sections.push({
      type: "product-groups",
      priority: page.product_groups_priority ?? 3,
      key: "product-groups",
    });
  }
  if (page.gallery && page.gallery.length > 0) {
    sections.push({
      type: "gallery",
      priority: page.gallery_priority ?? 4,
      key: "gallery",
    });
  }
  if (page.related_pages && page.related_pages.length > 0) {
    sections.push({
      type: "related-pages",
      priority: page.related_pages_priority ?? 5,
      key: "related-pages",
    });
  }

  sections.sort((a, b) => a.priority - b.priority);

  // SEO type inference: blog/news → article, otherwise website
  const seoType: "website" | "article" =
    page.page_type === "blog" || page.page_type === "news" ? "article" : "website";

  return (
    <>
      <Seo
        title={page.seo_meta?.meta_title || page.title}
        description={
          page.seo_meta?.meta_description ||
          (page.excerpt
            ? page.excerpt.replace(/[#*_~`>\[\]()!|-]/g, "").trim()
            : undefined)
        }
        keywords={(page.seo_meta?.keywords || []).map((k) => k.keyword)}
        image={page.seo_meta?.og_image?.url || page.featured_image?.url}
        type={seoType}
        noindex={!!page.seo_meta?.noindex}
      />

      <div
        style={
          bgUrl
            ? {
                backgroundImage: `url(${bgUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundAttachment: "fixed",
              }
            : undefined
        }
      >
        {sections.map((section) => {
          switch (section.type) {
            case "product-groups":
              return (
                <div key={section.key}>
                  {productGroups.map((g, idx) => (
                    <ProductGroupRenderer
                      key={g.documentId}
                      group={g}
                      even={idx % 2 === 1}
                    />
                  ))}
                </div>
              );
            case "featured-image":
              return (
                <section
                  key={section.key}
                  className="relative w-full overflow-hidden h-[60vh] md:h-[72vh] lg:h-[80vh] bg-secondary"
                >
                  <img
                    src={resolveMediaUrl(page.featured_image!.url)}
                    className="absolute inset-0 w-full h-full object-cover"
                    alt={page.title}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10"
                  />
                  <div className="relative h-full container-fluid flex flex-col justify-end pb-12 md:pb-20">
                    <p className="text-white/80 text-xs md:text-sm uppercase tracking-[0.22em] font-semibold mb-3">
                      {page.page_type === "shop" ? "Collection" : page.page_type || "Featured"}
                    </p>
                    <h1 className="font-display text-white text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.02] max-w-4xl drop-shadow-sm">
                      {page.title}
                    </h1>
                    {page.excerpt && (
                      <div
                        className="mt-4 max-w-2xl text-white/85 text-base md:text-lg prose prose-invert prose-sm md:prose-base"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.excerpt) }}
                      />
                    )}
                  </div>
                </section>
              );
            case "excerpt":
              return (
                <section key={section.key} className="py-16 md:py-20">
                  <div className="container-fluid">
                    <div
                      className="max-w-3xl mx-auto text-center prose prose-lg max-w-none prose-headings:font-display prose-headings:tracking-tight prose-img:rounded-xl prose-a:text-brand hover:prose-a:text-foreground"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(page.excerpt) }}
                    />
                  </div>
                </section>
              );
            case "content":
              return (
                <section key={section.key} className="py-16 md:py-20">
                  <div className="container-fluid">
                    <div
                      className="max-w-3xl mx-auto prose prose-lg max-w-none prose-headings:font-display prose-headings:tracking-tight prose-img:rounded-xl prose-a:text-brand hover:prose-a:text-foreground"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
                    />
                  </div>
                </section>
              );
            case "gallery":
              return (
                <section key={section.key} className="py-16 md:py-20 bg-secondary/30">
                  <div className="container-fluid">
                    <div className="mb-8">
                      <p className="eyebrow mb-2">Gallery</p>
                      <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                        Captured moments
                      </h2>
                    </div>
                    <MosaicGallery items={page.gallery!} alt={page.title} />
                  </div>
                </section>
              );
            case "related-pages":
              return (
                <section key={section.key} className="py-16 md:py-20">
                  <div className="container-fluid">
                    <div className="mb-8">
                      <p className="eyebrow mb-2">More to explore</p>
                      <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                        Related stories
                      </h2>
                    </div>
                    <div className="grid grid-cols-12 gap-5">
                      {page
                        .related_pages!.filter((rp) => rp.slug && rp.page_type)
                        .map((rp) => (
                        <div key={rp.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
                          <Link href={getPageUrl(rp)} className="group block h-full">
                            <article className="h-full flex flex-col rounded-2xl overflow-hidden bg-card border border-border shadow-card hover:shadow-card-hover transition-shadow duration-300 ease-smooth">
                              <div className="relative w-full aspect-[16/10] bg-secondary overflow-hidden">
                                {rp.featured_image?.url ? (
                                  <NextImage
                                    src={resolveMediaUrl(rp.featured_image.url)}
                                    fill
                                    className="object-cover transition-transform duration-700 ease-smooth group-hover:scale-105"
                                    alt={rp.title}
                                    useSkeleton
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                                    <span className="font-display text-5xl text-muted-foreground/40">
                                      {rp.title.charAt(0)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 flex flex-col p-5">
                                {rp.page_type && (
                                  <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-brand">
                                    {rp.page_type}
                                  </span>
                                )}
                                <h3 className="font-display text-xl font-bold mt-1.5 group-hover:text-brand transition-colors">
                                  {rp.title}
                                </h3>
                                {rp.excerpt && (
                                  <div
                                    className="text-sm text-muted-foreground mt-2 line-clamp-2 prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(rp.excerpt) }}
                                  />
                                )}
                                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                                  Read more
                                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                              </div>
                            </article>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            default:
              return null;
          }
        })}

        {page.enable_contact_form && <CmsContactFormSection title={page.title} />}
      </div>
    </>
  );
}

/* ─── Mosaic gallery — 1 tall hero + small tiles, repeats every 5 items ─── */

function MosaicGallery({
  items,
  alt,
}: {
  items: { url: string; alternativeText?: string }[];
  alt: string;
}) {
  // Each "block" = up to 5 images in an asymmetric grid.
  const blocks: typeof items[] = [];
  for (let i = 0; i < items.length; i += 5) blocks.push(items.slice(i, i + 5));

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => (
        <div
          key={bi}
          className={cn(
            "grid grid-cols-2 md:grid-cols-4 gap-3",
            "md:grid-rows-2"
          )}
        >
          {block.map((img, i) => {
            const isHero = i === 0;
            return (
              <div
                key={i}
                className={cn(
                  "relative overflow-hidden rounded-xl bg-secondary group",
                  isHero
                    ? "col-span-2 md:row-span-2 aspect-square md:aspect-auto"
                    : "aspect-square"
                )}
              >
                <NextImage
                  src={resolveMediaUrl(img.url)}
                  fill
                  className="object-cover transition-transform duration-700 ease-smooth group-hover:scale-105"
                  alt={img.alternativeText || alt}
                  useSkeleton
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
