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

export function getProductCardProps(item: ProductInterface, options?: { showBrand?: boolean; showCategory?: boolean; offerActive?: boolean; offerId?: string; sourceGroupId?: string }) {
  const variantPrice =
    item.variants && item.variants.length > 0
      ? item.variants.map((v) => v.selling_price)
      : [item.selling_price];

  const offerActive = options?.offerActive === true;
  const variantOfferPrice = offerActive
    ? (item.variants && item.variants.length > 0
        ? item.variants.map((v) => v.offer_price).filter((p) => p > 0)
        : (item.offer_price > 0 ? [item.offer_price] : []))
    : [];

  return {
    name: item.name,
    category: (options?.showCategory !== false) ? item.categories?.[0] : undefined,
    brand: (options?.showBrand !== false) ? item.brands?.[0] : undefined,
    thumbnail: item.gallery?.[0]?.url ?? null,
    secondaryThumbnail: item.gallery?.[1]?.url ?? null,
    slug: item.slug || item.documentId,
    variantPrice,
    variantOfferPrice: offerActive && variantOfferPrice.length > 0 ? variantOfferPrice : undefined,
    variantTermSummary: getVariantTermSummary(item),
    offerId: offerActive ? options?.offerId : undefined,
    // Source attribution is independent of whether an offer is currently
    // active — the detail page uses the groupId to ask the server which
    // offer (if any) applies right now. Always forward the group context
    // when we have it.
    sourceGroupId: options?.sourceGroupId,
    createdAt: item.createdAt,
  };
}
