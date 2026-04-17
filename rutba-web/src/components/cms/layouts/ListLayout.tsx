import Link from "next/link";
import NextImage from "@/components/next-image";
import { IMAGE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { ProductInterface, getVariantTermSummary } from "@/types/api/product";
import { currencyFormat } from "@/lib/use-currency";
import { sortProducts } from "./sort-products";
import type { SortOption } from "./GroupHeader";

interface ListLayoutProps {
  group: CmsProductGroupInterface;
  sort?: SortOption;
}

export default function ListLayout({ group, sort = "default" }: ListLayoutProps) {
  const products = sortProducts(group.products ?? [], sort);
  if (products.length === 0) return null;

  return (
    <div className="divide-y divide-slate-200">
      {products.map((item) => (
        <ListRow key={"list-" + item.id} product={item} showBrand={group.show_brand} showCategory={group.show_category} />
      ))}
    </div>
  );
}

function ListRow({ product, showBrand, showCategory }: { product: ProductInterface; showBrand?: boolean; showCategory?: boolean }) {
  const thumbnail = product.gallery?.[0]?.url ?? product.logo?.url ?? null;
  const price =
    product.variants && product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.selling_price))
      : product.selling_price;
  const brand = showBrand !== false ? product.brands?.[0] : undefined;
  const category = showCategory !== false ? product.categories?.[0] : undefined;

  return (
    <Link
      href={`/product/${product.documentId}`}
      className="flex items-center gap-4 py-4 group hover:bg-slate-50 transition-colors rounded-md px-2 -mx-2"
    >
      <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-md overflow-hidden bg-slate-100">
        {thumbnail ? (
          <NextImage
            src={IMAGE_URL + thumbnail}
            fill
            className="object-cover"
            alt={product.name}
            useSkeleton
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">
            📦
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
          {product.name}
        </h3>
        {(brand || category) && (
          <p className="text-xs text-slate-400 mt-0.5">
            {category?.name}{category && brand ? ' - ' : ''}{brand?.name}
          </p>
        )}
        {product.summary && (
          <p className="text-sm text-slate-500 mt-1 line-clamp-1">
            {product.summary}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {price > 0 && (
          <p className="font-semibold text-slate-900">
            {currencyFormat(price)}
          </p>
        )}
      </div>
    </Link>
  );
}

export { ListRow };
