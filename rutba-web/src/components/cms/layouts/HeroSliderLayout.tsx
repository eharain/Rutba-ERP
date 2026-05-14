import Link from "next/link";
import NextImage from "@/components/next-image";
import ScrollSlider from "@/components/ui/scroll-slider";
import { ArrowRight } from "lucide-react";
import { IMAGE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { currencyFormat } from "@/lib/use-currency";

interface HeroSliderLayoutProps {
  group: CmsProductGroupInterface;
}

export default function HeroSliderLayout({ group }: HeroSliderLayoutProps) {
  const products = group.products ?? [];
  if (products.length === 0) return null;

  return (
    <ScrollSlider
      autoPlay={products.length > 1 ? 6000 : undefined}
      showDots={products.length > 1}
      showArrows={products.length > 1}
      slideClassName="w-full"
    >
      {products.map((item) => {
        const image =
          item.gallery?.[0]?.url || item.logo?.url || null;
        if (!image) return null;

        const minPrice =
          item.variants && item.variants.length > 0
            ? Math.min(...item.variants.map((v) => v.selling_price))
            : item.selling_price;

        return (
          <Link
            key={"hero-" + item.id}
            href={`/product/${item.documentId}`}
            className="block group relative"
          >
            <div className="relative w-full h-[60vh] md:h-[72vh] lg:h-[82vh] overflow-hidden bg-secondary">
              <NextImage
                src={IMAGE_URL + image}
                fill
                className="object-cover transition-transform duration-1200 ease-smooth group-hover:scale-[1.04]"
                alt={item.name || "Featured product"}
                useSkeleton
                priority
              />

              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
              />

              <div className="absolute inset-x-0 bottom-0">
                <div className="container-fluid pb-10 md:pb-16 lg:pb-20">
                  <p className="text-white/80 text-xs md:text-sm uppercase tracking-[0.22em] font-semibold mb-3">
                    {group.title || group.name || "Featured"}
                  </p>
                  <h2 className="font-display text-white text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.02] max-w-4xl drop-shadow-sm">
                    {item.name}
                  </h2>
                  {item.categories?.[0]?.name && (
                    <p className="mt-3 text-white/80 text-sm md:text-base">
                      {item.categories[0].name}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white text-foreground text-sm font-semibold pl-5 pr-2 py-2 shadow-card group-hover:bg-brand group-hover:text-brand-foreground transition-colors duration-300">
                      <span>Shop Now</span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background group-hover:bg-brand-foreground group-hover:text-brand transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </span>
                    {minPrice > 0 && (
                      <span className="text-white/90 text-base md:text-lg">
                        From{" "}
                        <span className="font-bold">
                          {currencyFormat(minPrice)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </ScrollSlider>
  );
}
