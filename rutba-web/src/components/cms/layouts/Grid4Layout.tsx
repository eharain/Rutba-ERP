import ProductCard from "@/components/product-list/product-card";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { ProductInterface } from "@/types/api/product";
import { sortProducts, getProductCardProps } from "./sort-products";
import type { SortOption } from "./GroupHeader";

interface Grid4LayoutProps {
  group: CmsProductGroupInterface;
  sort?: SortOption;
  offerActive?: boolean;
  offerId?: string;
  sourceGroupId?: string;
}

export default function Grid4Layout({ group, sort = "default", offerActive, offerId, sourceGroupId }: Grid4LayoutProps) {
  const products = sortProducts(group.products ?? [], sort);
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((item) => (
        <ProductCard key={"g4-" + item.id} {...getProductCardProps(item, { showBrand: group.show_brand, showCategory: group.show_category, offerActive, offerId, sourceGroupId })} />
      ))}
    </div>
  );
}
