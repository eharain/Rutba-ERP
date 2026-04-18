import ProductCard from "@/components/product-list/product-card";
import ScrollSlider from "@/components/ui/scroll-slider";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { sortProducts, getProductCardProps } from "./sort-products";
import type { SortOption } from "./GroupHeader";

interface CarouselLayoutProps {
  group: CmsProductGroupInterface;
  sort?: SortOption;
  offerActive?: boolean;
}

export default function CarouselLayout({ group, sort = "default", offerActive }: CarouselLayoutProps) {
  const products = sortProducts(group.products ?? [], sort);
  if (products.length === 0) return null;

  return (
    <ScrollSlider
      showArrows
      slideClassName="w-[75vw] sm:w-[45vw] md:w-[30vw] lg:w-[18vw] pr-3"
    >
      {products.map((item) => (
        <ProductCard key={"car-" + item.id} {...getProductCardProps(item, { showBrand: group.show_brand, showCategory: group.show_category, offerActive })} />
      ))}
    </ScrollSlider>
  );
}
