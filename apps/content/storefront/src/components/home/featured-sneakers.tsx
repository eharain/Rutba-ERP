import ProductCard from "@/components/product-list/product-card";
import { useQuery } from "@tanstack/react-query";
import { SkeletonProduct } from "../skeleton";
import { ErrorCard } from "../errors/error-card";
import { createWebProductsService } from "@/services/";
import { getVariantTermSummary } from "@/types/api/product";
import { BASE_URL } from "@/static/const";

export default function FeaturedSneakers() {
  const productsService = createWebProductsService({ baseURL: BASE_URL });

  const {
    data: products,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["featured-sneakers"],
    queryFn: async () => {
      return productsService.getFeaturedSneakers();
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-12 gap-[10px] lg:gap-[10px]">
        {[...Array(6)].map((item, index) => {
          return (
            <div
              key={"skeleton-product-" + index}
              className="col-span-6 md:col-span-4 lg:col-span-2"
            >
              <SkeletonProduct></SkeletonProduct>
            </div>
          );
        })}
      </div>
    );
  }

  if (isError && !products) {
    return (
      <ErrorCard
        message={(error as Error).message}
        onRetry={() => refetch()}
      ></ErrorCard>
    );
  }

  const sourceGroupId = products?.group?.slug || products?.group?.documentId;
  const items = products?.products ?? [];

  return (
    <div className="grid grid-cols-12 gap-[10px] lg:gap-[10px]">
      {items.map((item) => {
        const variantPrice = item.variants.length > 0 ? item.variants.map(
          (item) => item.selling_price
        ) : [item.selling_price];

        return (
          <div
            key={"product-featured-" + item.id}
            className="col-span-6 md:col-span-4 lg:col-span-2"
          >
            <ProductCard
              name={item.name}
              category={item.categories?.[0]}
              brand={item.brands?.[0]}
              thumbnail={item.logo?.url ?? item.gallery?.[0]?.url ?? null}
              slug={item.slug || item.documentId}
              variantPrice={variantPrice}
              variantTermSummary={getVariantTermSummary(item)}
              sourceGroupId={sourceGroupId}
            ></ProductCard>
          </div>
        );
      })}
    </div>
  );
}
