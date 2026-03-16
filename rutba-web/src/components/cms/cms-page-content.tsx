import NextImage from "@/components/next-image";
import ProductCard from "@/components/product-list/product-card";
import Link from "next/link";
import Head from "next/head";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed());

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

import { IMAGE_URL } from "@/static/const";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { ProductInterface } from "@/types/api/product";
import { BrandInterface } from "@/types/api/brand";
import { CategoryInterface } from "@/types/api/category";

export default function CmsPageContent({
  page,
}: {
  page: CmsPageDetailInterface;
}) {
  const heroGroups = page.hero_product_groups ?? [];
  const heroProducts = heroGroups.flatMap((g) => g.products ?? []);
  const brandGroups = [...(page.brand_groups ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const categoryGroups = [...(page.category_groups ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const productGroups = page.product_groups ?? [];

  return (
    <>
      <Head>
        <title>{page.title} - Rutba.pk</title>
        {page.excerpt && <meta name="description" content={page.excerpt.replace(/[#*_~`>\[\]()!|-]/g, '').trim()} />}
      </Head>

      {/* Hero Slider */}
      {heroProducts.length > 0 && (
        <div className="hero-swiper-container">
          <Swiper
            modules={[Navigation, Pagination, Autoplay]}
            spaceBetween={0}
            slidesPerView={1}
            navigation={true}
            pagination={{ clickable: true }}
            loop={heroProducts.length > 1}
            autoplay={{ delay: 5000, disableOnInteraction: false }}
            className="w-full"
          >
            {heroProducts.map((item) => (
              <SwiperSlide key={"hero-" + item.id}>
                <Link href={`/product/${item.documentId}`}>
                  <div className="relative w-full h-[30vh] md:h-[45vh] lg:h-[70vh] xl:h-[80vh] overflow-hidden">
                    {item.logo?.url && (
                      <NextImage
                        src={IMAGE_URL + item.logo.url}
                        layout="fill"
                        className="object-cover"
                        alt={item.name || "hero-banner"}
                        useSkeleton
                        priority
                      />
                    )}
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      )}

      {/* Featured Image (fallback when no hero slider) */}
      {heroProducts.length === 0 && page.featured_image?.url && (
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

      {/* Brand Groups */}
      {brandGroups.map((group) =>
        group.brands && group.brands.length > 0 ? (
          <div key={"bg-" + group.id} className="my-20">
            <div className="container-fluid">
              <h2 className="text-3xl font-bold mb-7">{group.name}</h2>
              <BrandSwiper brands={group.brands} />
            </div>
          </div>
        ) : null
      )}

      {/* Category Groups */}
      {categoryGroups.map((group) =>
        group.categories && group.categories.length > 0 ? (
          <div key={"cg-" + group.id} className="my-20">
            <div className="container-fluid">
              <h2 className="text-3xl font-bold mb-7">{group.name}</h2>
              <CategorySwiper categories={group.categories} />
            </div>
          </div>
        ) : null
      )}

      {/* Product Groups */}
      {productGroups.map((group) =>
        group.products && group.products.length > 0 ? (
          <div key={"pg-" + group.id} className="my-20">
            <div className="container-fluid">
              <h2 className="text-3xl font-bold mb-7">{group.name}</h2>
              <ProductGrid products={group.products} />
            </div>
          </div>
        ) : null
      )}

      {/* Content */}
      {page.content && (
        <div className="container mx-auto my-12 px-4">
          <div
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: marked.parse(page.content) as string }}
          />
        </div>
      )}

      {/* Gallery */}
      {page.gallery && page.gallery.length > 0 && (
        <div className="container mx-auto my-12 px-4">
          <h2 className="text-2xl font-bold mb-4">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {page.gallery.map((img, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-lg overflow-hidden"
              >
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

      {/* Related Pages */}
      {page.related_pages && page.related_pages.length > 0 && (
        <div className="container mx-auto my-12 px-4">
          <h2 className="text-2xl font-bold mb-5">Related Pages</h2>
          <div className="grid grid-cols-12 gap-4">
            {page.related_pages.map((rp) => (
              <div
                key={rp.id}
                className="col-span-12 md:col-span-6 lg:col-span-4"
              >
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
    </>
  );
}

/* ── Brand Swiper (matches existing BrandList styling) ── */
function BrandSwiper({ brands }: { brands: BrandInterface[] }) {
  return (
    <Swiper
      spaceBetween={5}
      grabCursor={true}
      slidesPerView={3}
      breakpoints={{
        "620": { slidesPerView: 5 },
        "1024": { slidesPerView: 9 },
      }}
    >
      {brands.map((item) => (
        <SwiperSlide key={"brand-" + item.id}>
          <Link
            href={{ pathname: "/product", query: { brand: item.slug } }}
          >
            <div className="bg-slate-100 px-3 w-full py-3 flex items-center justify-center flex-col rounded-md border border-transparent hover:shadow-sm hover:border-slate-300">
              {item.logo && (
                <NextImage
                  src={IMAGE_URL + (item.logo.url ?? "")}
                  height={50}
                  width={50}
                  alt={item.name}
                />
              )}
              <p>{item.name}</p>
            </div>
          </Link>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

/* ── Category Swiper ── */
function CategorySwiper({ categories }: { categories: CategoryInterface[] }) {
  return (
    <Swiper
      spaceBetween={5}
      grabCursor={true}
      slidesPerView={3}
      breakpoints={{
        "620": { slidesPerView: 5 },
        "1024": { slidesPerView: 9 },
      }}
    >
      {categories.map((item) => (
        <SwiperSlide key={"cat-" + item.id}>
          <Link
            href={{ pathname: "/product", query: { category: item.slug } }}
          >
            <div className="bg-slate-100 px-3 w-full py-3 flex items-center justify-center flex-col rounded-md border border-transparent hover:shadow-sm hover:border-slate-300">
              {item.logo && (
                <NextImage
                  src={IMAGE_URL + (item.logo.url ?? "")}
                  height={50}
                  width={50}
                  alt={item.name}
                />
              )}
              <p>{item.name}</p>
            </div>
          </Link>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

/* ── Product Grid (matches existing FeaturedSneakers styling) ── */
function ProductGrid({ products }: { products: ProductInterface[] }) {
  return (
    <div className="grid grid-cols-12 gap-[10px] lg:gap-[10px]">
      {products.map((item) => {
        const variantPrice =
          item.variants && item.variants.length > 0
            ? item.variants.map((v) => v.selling_price)
            : [item.selling_price];

        return (
          <div
            key={"product-" + item.id}
            className="col-span-6 md:col-span-4 lg:col-span-2"
          >
            <ProductCard
              name={item.name}
              category={item.categories?.[0]}
              brand={item.brands?.[0]}
              thumbnail={item.gallery?.[0]?.url ?? null}
              slug={item.documentId}
              variantPrice={variantPrice}
            />
          </div>
        );
      })}
    </div>
  );
}
