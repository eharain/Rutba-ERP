import ProductCard from "@/components/product-list/product-card";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { sortProducts, getProductCardProps } from "./sort-products";
import type { SortOption } from "./GroupHeader";

interface Grid6LayoutProps {
  group: CmsProductGroupInterface;
  sort?: SortOption;
  offerActive?: boolean;
}

export default function Grid6Layout({ group, sort = "default", offerActive }: Grid6LayoutProps) {
  const products = sortProducts(group.products ?? [], sort);
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[10px]">
      {products.map((item) => (
        <ProductCard key={"g6-" + item.id} {...getProductCardProps(item, { showBrand: group.show_brand, showCategory: group.show_category, offerActive })} />
      ))}
    </div>
  );
}
