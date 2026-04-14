import NextImage from "@/components/next-image";
import Link from "next/link";
import Head from "next/head";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";

import { IMAGE_URL } from "@/static/const";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import CmsArticleSidebar from "./cms-article-sidebar";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

export default function CmsNewsPageContent({
  page,
}: {
  page: CmsPageDetailInterface;
}) {
  const publishedDate = page.publishedAt
    ? new Date(page.publishedAt).toLocaleDateString("en-PK", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <>
      <Head>
        <title>{page.title} - Rutba.pk</title>
        {page.excerpt && (
          <meta
            name="description"
            content={page.excerpt.replace(/[#*_~`>\[\]()!|-]/g, "").trim()}
          />
        )}
      </Head>

      <div className="container-fluid my-16">
        <div className="flex flex-col lg:flex-row gap-10">
          {/* Main content */}
          <article className="flex-1 min-w-0 max-w-4xl">
            <header className="mb-8">
              <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
                News
              </span>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight mt-2">
                {page.title}
              </h1>
              {publishedDate && (
                <p className="text-sm text-slate-400 mt-3">{publishedDate}</p>
              )}
            </header>

            {page.featured_image?.url && (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-10">
                <NextImage
                  src={IMAGE_URL + page.featured_image.url}
                  fill
                  className="object-cover"
                  alt={page.title}
                  useSkeleton
                />
              </div>
            )}

            {page.excerpt && (
              <div
                className="prose prose-lg prose-slate max-w-none mb-10 text-slate-600 border-l-4 border-red-200 pl-4"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(page.excerpt) as string,
                }}
              />
            )}

            {page.content && (
              <div
                className="prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(page.content) as string,
                }}
              />
            )}

            {page.gallery && page.gallery.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold mb-4">Gallery</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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

            {page.related_pages && page.related_pages.length > 0 && (
              <div className="mt-12 pt-8 border-t border-slate-200">
                <h2 className="text-2xl font-bold mb-5">Related</h2>
                <div className="grid grid-cols-12 gap-4">
                  {page.related_pages.map((rp) => (
                    <div
                      key={rp.id}
                      className="col-span-12 md:col-span-6"
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
                              <span className="text-slate-400 text-3xl">📰</span>
                            </div>
                          )}
                          <div className="p-4">
                            <h3 className="font-semibold mt-1 group-hover:text-blue-600 transition-colors">
                              {rp.title}
                            </h3>
                            {rp.excerpt && (
                              <div
                                className="text-sm text-slate-500 mt-1 line-clamp-2 prose prose-sm"
                                dangerouslySetInnerHTML={{
                                  __html: marked.parse(rp.excerpt) as string,
                                }}
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
          </article>

          {/* Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-24">
              <CmsArticleSidebar
                currentType="news"
                currentDocumentId={page.documentId}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
