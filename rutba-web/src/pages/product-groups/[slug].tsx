import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { marked } from "marked";
import { useQuery } from "@tanstack/react-query";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import LayoutMain from "@/components/layouts";
import ProductCard from "@/components/product-list/product-card";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { IMAGE_URL } from "@/static/const";
import { getProductGroupBySlug, ProductGroupDetailResponse } from "@/services/product-groups";
import { sortProducts, getProductCardProps } from "@/components/cms/layouts/sort-products";
import type { SortOption } from "@/components/cms/layouts/GroupHeader";

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
];

export const getServerSideProps: GetServerSideProps<{
  initialData: ProductGroupDetailResponse | null;
  slug: string;
}> = async (context) => {
  const slug = context.params?.slug as string;
  const page = parseInt(context.query.page as string, 10) || 1;
  const pageSize = parseInt(context.query.pageSize as string, 10) || 24;

  try {
    const data = await getProductGroupBySlug(slug, page, pageSize);
    return { props: { initialData: data, slug } };
  } catch {
    return { props: { initialData: null, slug } };
  }
};

export default function ProductGroupPage({
  initialData,
  slug: ssrSlug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const slug = (router.query.slug as string) ?? ssrSlug;
  const [page, setPage] = useState(
    parseInt(router.query.page as string, 10) || 1
  );
  const [pageSize, setPageSize] = useState(
    parseInt(router.query.pageSize as string, 10) || 24
  );
  const [sort, setSort] = useState<SortOption>("default");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["product-group", slug, page, pageSize],
    queryFn: () => getProductGroupBySlug(slug, page, pageSize),
    enabled: !!slug,
    staleTime: 60_000,
    initialData: initialData ?? undefined,
  });

  const group = data?.data;
  const pagination = data?.meta?.pagination;

  // Update URL when page/pageSize changes
  const navigatePage = (newPage: number, newPageSize?: number) => {
    const ps = newPageSize ?? pageSize;
    setPage(newPage);
    if (newPageSize) setPageSize(newPageSize);
    router.push(
      { pathname: router.pathname, query: { slug, page: newPage, pageSize: ps } },
      undefined,
      { shallow: true }
    );
  };

  if (isLoading) {
    return (
      <LayoutMain>
        <SkeletonProductDetail />
      </LayoutMain>
    );
  }

  if (isError) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20">
          <ErrorCard message={(error as Error).message} />
        </div>
      </LayoutMain>
    );
  }

  if (!group) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Product group not found</h2>
          <Link href="/shop" className="text-blue-600 hover:underline">
            Back to shop
          </Link>
        </div>
      </LayoutMain>
    );
  }

  const products = sortProducts(group.products ?? [], sort);

  return (
    <>
      <Head>
        <title>{group.title || group.name} - Rutba.pk</title>
        {group.excerpt && (
          <meta
            name="description"
            content={group.excerpt.replace(/[#*_~`>\[\]()!|-]/g, "").trim()}
          />
        )}
      </Head>
    <LayoutMain>
      <div>
      {/* Cover Image */}
      {group.cover_image?.url && (
        <div className="relative w-full overflow-hidden" style={{ maxHeight: "40vh" }}>
          <img
            src={IMAGE_URL + group.cover_image.url}
            className="w-full block object-cover"
            alt={group.title || group.name}
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <h1 className="text-white text-3xl md:text-5xl font-bold text-center px-4">
              {group.title || group.name}
            </h1>
          </div>
        </div>
      )}

      <div className="container-fluid py-8">
        {/* Header */}
        {!group.cover_image?.url && (
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-2">
            {group.title || group.name}
          </h1>
        )}

        {group.excerpt && (
          <div
            className="prose prose-slate max-w-none prose-sm mb-6"
            dangerouslySetInnerHTML={{ __html: marked.parse(group.excerpt) as string }}
          />
        )}

        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200">
          <div className="text-sm text-slate-500">
            {pagination && (
              <>
                Showing{" "}
                {Math.min((page - 1) * pageSize + 1, pagination.total)}–
                {Math.min(page * pageSize, pagination.total)} of{" "}
                {pagination.total} products
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* Page Size */}
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value, 10);
                navigatePage(1, newSize);
              }}
              className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} per page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {products.length === 0 ? (
          <p className="text-slate-500 text-center py-12">No products in this group.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((item) => (
              <ProductCard key={"pg-" + item.id} {...getProductCardProps(item)} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => navigatePage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {Array.from({ length: pagination.pageCount }, (_, i) => i + 1)
              .filter((p) => {
                if (pagination.pageCount <= 7) return true;
                if (p === 1 || p === pagination.pageCount) return true;
                if (Math.abs(p - page) <= 1) return true;
                return false;
              })
              .reduce<(number | string)[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                typeof item === "string" ? (
                  <span key={`e-${idx}`} className="px-2 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => navigatePage(item)}
                    className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                      item === page
                        ? "bg-slate-800 text-white border-slate-800"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              onClick={() => navigatePage(Math.min(pagination.pageCount, page + 1))}
              disabled={page >= pagination.pageCount}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* Content */}
        {group.content && (
          <div
            className="mt-8 prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600"
            dangerouslySetInnerHTML={{ __html: marked.parse(group.content) as string }}
          />
        )}
      </div>
      </div>
    </LayoutMain>
    </>
  );
}
