import Link from "next/link";
import NextImage from "@/components/next-image";
import ScrollSlider from "@/components/ui/scroll-slider";
import { IMAGE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";

interface HeroSliderLayoutProps {
  group: CmsProductGroupInterface;
}

export default function HeroSliderLayout({ group }: HeroSliderLayoutProps) {
  const products = group.products ?? [];
  if (products.length === 0) return null;

  return (
    <ScrollSlider
      autoPlay={5000}
      showDots
      showArrows
      slideClassName="w-full"
    >
      {products.map((item) => {
        const heroImages =
          item.gallery && item.gallery.length > 0
            ? item.gallery.map((g) => g.url)
            : item.logo?.url
            ? [item.logo.url]
            : [];

        if (heroImages.length === 0) return null;

        return (
          <Link
            key={"hero-" + item.id}
            href={`/product/${item.documentId}`}
            className="block"
          >
            <div className="relative w-full h-[30vh] md:h-[45vh] lg:h-[70vh] xl:h-[80vh] overflow-hidden flex">
              {heroImages.map((url, idx) => (
                <div
                  key={idx}
                  className="relative flex-1 h-full overflow-hidden"
                >
                  <NextImage
                    src={IMAGE_URL + url}
                    fill
                    className="object-contain"
                    alt={`${item.name || "Rutba"} ${idx + 1}`}
                    useSkeleton
                  />
                </div>
              ))}
            </div>
          </Link>
        );
      })}
    </ScrollSlider>
  );
}
