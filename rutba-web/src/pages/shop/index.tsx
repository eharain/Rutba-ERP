import LayoutMain from "@/components/layouts";
import Link from "next/link";
import NextImage from "@/components/next-image";
import { useQuery } from "@tanstack/react-query";
import { SkeletonProduct } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { IMAGE_URL } from "@/static/const";
import useCmsPagesService, { getCmsPagesByTypeSSR } from "@/services/cms-pages";
import { CmsPageInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";

const PAGE_TYPE = "shop";

export const getServerSideProps: GetServerSideProps<{
  initialPages: CmsPageInterface[];
}> = async () => {
  try {
    const pages = await getCmsPagesByTypeSSR(PAGE_TYPE);
    return { props: { initialPages: pages ?? [] } };
  } catch {
    return { props: { initialPages: [] } };
  }
};

export default function ShopIndex({
  initialPages,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { getCmsPagesByType } = useCmsPagesService();

  const {
    data: pages,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-pages-list", PAGE_TYPE],
    queryFn: () => getCmsPagesByType(PAGE_TYPE),
    staleTime: 60_000,
    initialData: initialPages.length > 0 ? initialPages : undefined,
  });

  return (
    <LayoutMain>
      <>
        <Head>
          <title>Shop - Rutba.pk</title>
        </Head>

        <div className="container-fluid my-16">
          <h1 className="text-3xl font-bold mb-8">Shop</h1>

          {isLoading && (
            <div className="grid grid-cols-12 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="col-span-12 md:col-span-6 lg:col-span-4">
                  <SkeletonProduct />
                </div>
              ))}
            </div>
          )}

          {isError && <ErrorCard message={(error as Error).message} />}

          {!isLoading && !isError && pages && pages.length === 0 && (
            <p className="text-slate-500 text-center py-12">No shop pages published yet.</p>
          )}

          {!isLoading && !isError && pages && pages.length > 0 && (
            <div className="grid grid-cols-12 gap-6">
              {pages.map((page) => (
                <div key={page.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                  <Link href={getPageUrl(page)} className="block group">
                    <div className="rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                      {page.featured_image?.url ? (
                        <div className="relative w-full h-48">
                          <NextImage
                            src={IMAGE_URL + page.featured_image.url}
                            fill
                            className="object-cover"
                            alt={page.title}
                            useSkeleton
                          />
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-slate-100 flex items-center justify-center">
                          <span className="text-slate-400 text-4xl">🛍️</span>
                        </div>
                      )}
                      <div className="p-4">
                        <h2 className="text-lg font-semibold mt-1 group-hover:text-blue-600 transition-colors">
                          {page.title}
                        </h2>
                        {page.excerpt && (
                          <p className="text-sm text-slate-500 mt-2 line-clamp-2">{page.excerpt}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    </LayoutMain>
  );
}
