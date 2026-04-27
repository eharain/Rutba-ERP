import NextImage from "@/components/next-image";
import Link from "next/link";
import Head from "next/head";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";

import { IMAGE_URL } from "@/static/const";
import { CmsPageDetailInterface, CmsProductGroupInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import ProductGroupRenderer from "./ProductGroupRenderer";
import { useSiteSettings } from "@/hooks/use-site-settings";
import CmsContactFormSection from "./cms-contact-form-section";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

export default function CmsPageContent({
  page,
}: {
  page: CmsPageDetailInterface;
}) {
  const settings = useSiteSettings();
  // Only use product_groups
  // A product group with layout 'hero-slider' assigned via product_groups will render as a slider.
  const groupMap = new Map<string, CmsProductGroupInterface>();
  for (const g of page.product_groups ?? []) {
    groupMap.set(g.documentId, g);
  }

  const bgUrl = page.background_image?.url
    ? IMAGE_URL + page.background_image.url
    : null;

  // Build a unified list of renderable sections with priorities
  type Section =
    | { type: "product-group"; priority: number; group: CmsProductGroupInterface; key: string }
    | { type: "featured-image"; priority: number; key: string }
    | { type: "excerpt"; priority: number; key: string }
    | { type: "content"; priority: number; key: string }
    | { type: "gallery"; priority: number; key: string }
    | { type: "related-pages"; priority: number; key: string };

  const sections: Section[] = [];

  // Product groups
  for (const g of groupMap.values()) {
    sections.push({ type: "product-group", priority: g.priority ?? 50, group: g, key: "pg-" + g.documentId });
  }

  // Page-owned sections (only if they have content)
  if (page.featured_image?.url) {
    sections.push({ type: "featured-image", priority: page.featured_image_priority ?? 0, key: "featured-image" });
  }
  if (page.excerpt) {
    sections.push({ type: "excerpt", priority: page.excerpt_priority ?? 2, key: "excerpt" });
  }
  if (page.content) {
    sections.push({ type: "content", priority: page.content_priority ?? 98, key: "content" });
  }
  if (page.gallery && page.gallery.length > 0) {
    sections.push({ type: "gallery", priority: page.gallery_priority ?? 100, key: "gallery" });
  }
  if (page.related_pages && page.related_pages.length > 0) {
    sections.push({ type: "related-pages", priority: page.related_pages_priority ?? 102, key: "related-pages" });
  }

  // Sort by priority ascending
  sections.sort((a, b) => a.priority - b.priority);

  let groupIdx = 0;

  return (
    <>
      <Head>
        <title>{page.title} - {settings.site_name}</title>
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
        {sections.map((section) => {
          switch (section.type) {
            case "product-group": {
              const even = groupIdx % 2 === 1;
              groupIdx++;
              return (
                <ProductGroupRenderer
                  key={section.key}
                  group={section.group}
                  even={even}
                />
              );
            }
            case "featured-image":
              return (
                <div key={section.key} className="relative w-full overflow-hidden" style={{ maxHeight: '60vh' }}>
                  <img
                    src={IMAGE_URL + page.featured_image!.url}
                    className="w-full block object-cover"
                    alt={page.title}
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <h1 className="text-white text-3xl md:text-5xl font-bold text-center px-4">
                      {page.title}
                    </h1>
                  </div>
                </div>
              );
            case "excerpt":
              return (
                <div key={section.key} className="container-fluid my-12">
                  <div
                    className="prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
                    dangerouslySetInnerHTML={{ __html: marked.parse(page.excerpt!) as string }}
                  />
                </div>
              );
            case "content":
              return (
                <div key={section.key} className="container-fluid my-12">
                  <div
                    className="prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
                    dangerouslySetInnerHTML={{ __html: marked.parse(page.content!) as string }}
                  />
                </div>
              );
            case "gallery":
              return (
                <div key={section.key} className="container-fluid my-12">
                  <h2 className="text-2xl font-bold mb-4">Gallery</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {page.gallery!.map((img, i) => (
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
              );
            case "related-pages":
              return (
                <div key={section.key} className="container-fluid my-12">
                  <h2 className="text-2xl font-bold mb-5">Related Pages</h2>
                  <div className="grid grid-cols-12 gap-4">
                    {page.related_pages!.map((rp) => (
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
