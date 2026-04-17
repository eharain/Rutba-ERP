import { ProductInterface, getVariantTermSummary } from "@/types/api/product";
import type { SortOption } from "./GroupHeader";

export function sortProducts(
  products: ProductInterface[],
  sort: SortOption
): ProductInterface[] {
  if (sort === "default") return products;
  const sorted = [...products];
  switch (sort) {
    case "newest":
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "price_asc":
      return sorted.sort((a, b) => getMinPrice(a) - getMinPrice(b));
    case "price_desc":
      return sorted.sort((a, b) => getMinPrice(b) - getMinPrice(a));
    default:
      return sorted;
  }
}

function getMinPrice(p: ProductInterface): number {
  if (p.variants && p.variants.length > 0) {
    return Math.min(...p.variants.map((v) => v.selling_price));
  }
  return p.selling_price;
}

export function getProductCardProps(item: ProductInterface) {
  const variantPrice =
    item.variants && item.variants.length > 0
      ? item.variants.map((v) => v.selling_price)
      : [item.selling_price];

  return {
    name: item.name,
    category: item.categories?.[0],
    brand: item.brands?.[0],
    thumbnail: item.gallery?.[0]?.url ?? null,
    slug: item.documentId,
    variantPrice,
    variantTermSummary: getVariantTermSummary(item),
  };
}
