import LayoutMain from "@/components/layouts";
import Link from "next/link";
import NextImage from "@/components/next-image";
import ProductCard from "@/components/product-list/product-card";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { IMAGE_URL } from "@/static/const";
import useCmsPagesService from "@/services/cms-pages";
import Head from "next/head";

export default function CmsPageDetail() {
  const router = useRouter();
  const { slug } = router.query;
  const { getCmsPageBySlug } = useCmsPagesService();

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page", slug],
    queryFn: () => getCmsPageBySlug(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
  });

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
        <div className="container mx-auto my-20">
          <ErrorCard message={(error as Error).message} />
        </div>
      </LayoutMain>
    );
  }

  if (!page) {
    return (
      <LayoutMain>
        <div className="container mx-auto my-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Page not found</h2>
          <Link href="/pages" className="text-blue-600 hover:underline">
            Back to pages
          </Link>
        </div>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain>
      <>
        <Head>
          <title>{page.title} - Rutba.pk</title>
          {page.excerpt && <meta name="description" content={page.excerpt} />}
        </Head>

        {/* Hero / Featured Image */}
        {page.featured_image?.url && (
          <div className="relative w-full h-[30vh] md:h-[40vh] overflow-hidden">
            <NextImage
              src={IMAGE_URL + page.featured_image.url}
              layout="fill"
              className="object-cover"
              alt={page.title}
              useSkeleton
              priority
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <h1 className="text-white text-3xl md:text-5xl font-bold text-center px-4">
                {page.title}
              </h1>
            </div>
          </div>
        )}

        <div className="container mx-auto my-12 px-4">
          {/* Breadcrumb */}
          <nav className="mb-6 text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-700">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/pages" className="hover:text-slate-700">Pages</Link>
            <span className="mx-2">/</span>
            <span className="text-slate-800">{page.title}</span>
          </nav>

          {/* Title (if no featured image hero) */}
          {!page.featured_image?.url && (
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{page.title}</h1>
          )}

          {/* Excerpt */}
          {page.excerpt && (
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">{page.excerpt}</p>
          )}

          {/* Content */}
          {page.content && (
            <div
              className="prose prose-slate max-w-none mb-12"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          )}

          {/* Gallery */}
          {page.gallery && page.gallery.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-4">Gallery</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {page.gallery.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                    <NextImage
                      src={IMAGE_URL + img.url}
                      layout="fill"
                      className="object-cover"
                      alt={img.alternativeText || page.title}
                      useSkeleton
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Groups */}
          {page.product_groups && page.product_groups.length > 0 && (
            <div className="mb-12">
              {page.product_groups.map((group) => (
                <div key={group.id} className="mb-10">
                  <h2 className="text-2xl font-bold mb-5">{group.name}</h2>
                  {group.products && group.products.length > 0 ? (
                    <div className="grid grid-cols-12 gap-[10px] lg:gap-[10px]">
                      {group.products.map((product) => {
                        const variantPrice =
                          product.variants && product.variants.length > 0
                            ? product.variants.map((v) => v.selling_price)
                            : [product.selling_price];

                        return (
                          <div
                            key={product.id}
                            className="col-span-6 md:col-span-4 lg:col-span-2"
                          >
                            <ProductCard
                              name={product.name}
                              category={product.categories?.[0]}
                              brand={product.brands?.[0]}
                              thumbnail={product.gallery?.[0]?.url ?? null}
                              slug={product.documentId}
                              variantPrice={variantPrice}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-400">No products in this group.</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Related Pages */}
          {page.related_pages && page.related_pages.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-5">Related Pages</h2>
              <div className="grid grid-cols-12 gap-4">
                {page.related_pages.map((rp) => (
                  <div key={rp.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                    <Link href={`/pages/${rp.slug}`} className="block group">
                      <div className="rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                        {rp.featured_image?.url ? (
                          <div className="relative w-full h-40">
                            <NextImage
                              src={IMAGE_URL + rp.featured_image.url}
                              layout="fill"
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
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{rp.excerpt}</p>
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
    </LayoutMain>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
