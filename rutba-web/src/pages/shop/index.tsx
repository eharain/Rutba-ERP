import LayoutMain from "@/components/layouts";
import Link from "next/link";
import NextImage from "@/components/next-image";
import { useQuery } from "@tanstack/react-query";
import { SkeletonProduct } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { IMAGE_URL } from "@/static/const";
import {
  createWebCmsPagesService,
  getCmsPagesByTypeSSR,
} from "@/services";
import { CmsPageInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { BASE_URL } from "@/static/const";
import { ArrowRight } from "lucide-react";
import RecentlyViewed from "@/components/product-list/recently-viewed";
import Seo from "@/components/seo/seo";

const PAGE_TYPE = "shop";

export const getServerSideProps: GetServerSideProps<{
  initialPages: CmsPageInterface[];
}> = async () => {
  try {
    const pages = await getCmsPagesByTypeSSR(PAGE_TYPE, { baseURL: BASE_URL });
    return { props: { initialPages: pages ?? [] } };
  } catch {
    return { props: { initialPages: [] } };
  }
};

export default function ShopIndex({
  initialPages,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const cmsPagesService = createWebCmsPagesService({ baseURL: BASE_URL });

  const {
    data: pages,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-pages-list", PAGE_TYPE],
    queryFn: () => cmsPagesService.getCmsPagesByType(PAGE_TYPE),
    staleTime: 60_000,
    initialData: initialPages.length > 0 ? initialPages : undefined,
  });

  return (
    <LayoutMain>
      <>
        <Seo
          title="Shop"
          description="Browse our curated collections across every category."
          keywords="shop, collections, online store"
        />

        <div className="container-fluid py-16 md:py-20">
          <div className="mb-10 md:mb-14">
            <p className="eyebrow mb-2">Browse</p>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
              Shop the collections
            </h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Curated edits across every category. Tap a collection to explore the latest arrivals.
            </p>
          </div>

          {isLoading && (
            <div className="grid grid-cols-12 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="col-span-12 sm:col-span-6 lg:col-span-4">
                  <SkeletonProduct />
                </div>
              ))}
            </div>
          )}

          {isError && !pages && <ErrorCard message={(error as Error).message} />}

          {!isLoading && pages && pages.length === 0 && (
            <p className="text-muted-foreground text-center py-12">
              No shop pages published yet.
            </p>
          )}

          {!isLoading && pages && pages.length > 0 && (
            <div className="grid grid-cols-12 gap-5 md:gap-6">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="col-span-12 sm:col-span-6 lg:col-span-4"
                >
                  <Link href={getPageUrl(page)} className="group block h-full">
                    <article className="h-full flex flex-col rounded-2xl overflow-hidden bg-card border border-border shadow-card hover:shadow-card-hover transition-shadow duration-300 ease-smooth">
                      <div className="relative w-full aspect-[4/3] bg-secondary overflow-hidden">
                        {page.featured_image?.url ? (
                          <NextImage
                            src={IMAGE_URL + page.featured_image.url}
                            fill
                            className="object-cover transition-transform duration-700 ease-smooth group-hover:scale-105"
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
                          className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      <div className="flex-1 flex flex-col p-5">
                        <h2 className="font-display text-xl font-bold group-hover:text-brand transition-colors">
                          {page.title}
                        </h2>
                        {page.excerpt && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {page.excerpt}
                          </p>
                        )}
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                          Explore
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </article>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <RecentlyViewed />
      </>
    </LayoutMain>
  );
}
