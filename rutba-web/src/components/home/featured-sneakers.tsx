import ProductCard from "@/components/product-list/product-card";
import { useQuery } from "@tanstack/react-query";
import { SkeletonProduct } from "../skeleton";
import { ErrorCard } from "../errors/error-card";
import useProductsService from "@/services/products";

export default function FeaturedSneakers() {
  const { getFeaturedSneakers } = useProductsService();

  const {
    data: products,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["featured-sneakers"],
    queryFn: async () => {
      return getFeaturedSneakers();
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

  if (isError) {
    return <ErrorCard message={(error as Error).message}></ErrorCard>;
  }

  return (
    <div className="grid grid-cols-12 gap-[10px] lg:gap-[10px]">
      {products.map((item) => {
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
              thumbnail={item.gallery?.[0]?.url ?? null}
              slug={item.documentId}
              variantPrice={variantPrice}
            ></ProductCard>
          </div>
        );
      })}
    </div>
  );
}
