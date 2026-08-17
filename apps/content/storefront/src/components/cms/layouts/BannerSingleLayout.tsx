import Link from "next/link";
import NextImage from "@/components/next-image";
import { IMAGE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { currencyFormat } from "@/lib/use-currency";
import { renderMarkdown } from "@/lib/render-markdown";
import { ArrowRight } from "lucide-react";

interface BannerSingleLayoutProps {
  group: CmsProductGroupInterface;
}

export default function BannerSingleLayout({ group }: BannerSingleLayoutProps) {
  const product = (group.products ?? [])[0];
  if (!product) return null;

  const bgImage = product.gallery?.[0]?.url ?? product.logo?.url ?? null;

  const price =
    product.variants && product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.selling_price))
      : product.selling_price;

  return (
    <Link
      href={`/product/${encodeURIComponent(product.slug || product.documentId)}`}
      className="block group/banner"
    >
      <div className="container-fluid">
        <div className="relative w-full h-[50vh] md:h-[60vh] lg:h-[68vh] rounded-2xl overflow-hidden bg-secondary shadow-card">
          {bgImage && (
            <NextImage
              src={IMAGE_URL + bgImage}
              fill
              className="object-cover transition-transform duration-1200 ease-smooth group-hover/banner:scale-[1.04]"
              alt={product.name || "banner"}
              useSkeleton
            />
          )}

          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-12 lg:p-16">
            <p className="text-white/80 text-xs md:text-sm uppercase tracking-[0.22em] font-semibold mb-3">
              {group.title || group.name || "Spotlight"}
            </p>
            <h3 className="font-display text-white text-3xl md:text-5xl lg:text-6xl font-bold leading-[1.04] max-w-3xl drop-shadow-sm">
              {product.name}
            </h3>
            {group.excerpt && (
              <div
                className="mt-3 text-white/85 text-sm md:text-base line-clamp-2 max-w-2xl prose prose-invert prose-sm md:prose-base"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(group.excerpt),
                }}
              />
            )}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-white text-foreground text-sm font-semibold pl-5 pr-2 py-2 shadow-card group-hover/banner:bg-brand group-hover/banner:text-brand-foreground transition-colors duration-300">
                <span>Shop Now</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background group-hover/banner:bg-brand-foreground group-hover/banner:text-brand transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </span>
              {price > 0 && (
                <span className="text-white/90 text-base md:text-lg">
                  From{" "}
                  <span className="font-bold">{currencyFormat(price)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
