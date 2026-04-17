import NextImage from "@/components/next-image";
import Link from "next/link";
import Head from "next/head";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";

import { IMAGE_URL } from "@/static/const";
import { CmsPageDetailInterface, CmsProductGroupInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import ProductGroupRenderer from "./ProductGroupRenderer";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

export default function CmsPageContent({
  page,
}: {
  page: CmsPageDetailInterface;
}) {
  // Combine hero_product_groups and product_groups, deduplicate, sort by priority
  const groupMap = new Map<string, CmsProductGroupInterface>();
  for (const g of page.hero_product_groups ?? []) {
    groupMap.set(g.documentId, g);
  }
  for (const g of page.product_groups ?? []) {
    if (!groupMap.has(g.documentId)) {
      groupMap.set(g.documentId, g);
    }
  }
  const allGroups = Array.from(groupMap.values()).sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
  );

  const bgUrl = page.background_image?.url
    ? IMAGE_URL + page.background_image.url
    : null;

  const hasHeroGroup = allGroups.some(
    (g) => g.layout === "hero-slider" || g.layout === "banner-single"
  );

  return (
    <>
      <Head>
        <title>{page.title} - Rutba.pk</title>
        {page.excerpt && <meta name="description" content={page.excerpt.replace(/[#*_~`>\[\]()!|-]/g, '').trim()} />}
      </Head>

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

      {/* Featured Image (fallback when no hero-style group) */}
      {!hasHeroGroup && page.featured_image?.url && (
        <div className="relative w-full overflow-hidden" style={{ maxHeight: '60vh' }}>
          <img
            src={IMAGE_URL + page.featured_image.url}
            className="w-full block object-cover"
            alt={page.title}
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <h1 className="text-white text-3xl md:text-5xl font-bold text-center px-4">
              {page.title}
            </h1>
          </div>
        </div>
      )}

      {/* Excerpt */}
      {page.excerpt && (
        <div className="container-fluid my-12">
          <div
            className="prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
            dangerouslySetInnerHTML={{ __html: marked.parse(page.excerpt) as string }}
          />
        </div>
      )}

      {/* Product Groups — sorted by priority, each rendered via its layout */}
      {allGroups.map((group, idx) => (
        <ProductGroupRenderer
          key={"pg-" + group.documentId}
          group={group}
          even={idx % 2 === 1}
        />
      ))}

      {/* Content */}
      {page.content && (
        <div className="container-fluid my-12">
          <div
            className="prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
            dangerouslySetInnerHTML={{ __html: marked.parse(page.content) as string }}
          />
        </div>
      )}

      {/* Gallery */}
      {page.gallery && page.gallery.length > 0 && (
        <div className="container-fluid my-12">
          <h2 className="text-2xl font-bold mb-4">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {page.gallery.map((img, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-lg overflow-hidden"
              >
                <NextImage
                  src={IMAGE_URL + img.url}
                  fill
                  className="object-cover"
                  alt={img.alternativeText || page.title}
                  useSkeleton
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Pages */}
      {page.related_pages && page.related_pages.length > 0 && (
        <div className="container-fluid my-12">
          <h2 className="text-2xl font-bold mb-5">Related Pages</h2>
          <div className="grid grid-cols-12 gap-4">
            {page.related_pages.map((rp) => (
              <div
                key={rp.id}
                className="col-span-12 md:col-span-6 lg:col-span-4"
              >
                <Link href={getPageUrl(rp)} className="block group">
                  <div className="rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                    {rp.featured_image?.url ? (
                      <div className="relative w-full h-40">
                        <NextImage
                          src={IMAGE_URL + rp.featured_image.url}
                          fill
                          className="object-cover"
                          alt={rp.title}
                          useSkeleton
                        />
                      </div>
                    ) : (
                      <div className="w-full h-40 bg-slate-100 flex items-center justify-center">
                        <span className="text-slate-400 text-3xl">📄</span>
                      </div>
                    )}
                    <div className="p-4">
                      <span className="text-xs uppercase tracking-wide text-slate-400">
                        {rp.page_type}
                      </span>
                      <h3 className="font-semibold mt-1 group-hover:text-blue-600 transition-colors">
                        {rp.title}
                      </h3>
                      {rp.excerpt && (
                        <div
                          className="text-sm text-slate-500 mt-1 line-clamp-2 prose prose-sm"
                          dangerouslySetInnerHTML={{ __html: marked.parse(rp.excerpt) as string }}
                        />
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
