import Link from "next/link";
import NextImage from "../next-image";
import { CategoryInterface } from "@/types/api/category";
import { IMAGE_URL } from "@/static/const";
import { BrandInterface } from "@/types/api/brand";
import { currencyFormat } from "@/lib/use-currency";
import { VariantTermSummary } from "@/types/api/product";

export interface ProductCardInterface {
  name: string;
  category?: Pick<CategoryInterface, "name" | "slug">;
  brand?: Pick<BrandInterface, "name" | "slug">;
  thumbnail: string | null;
  variantPrice: number[];
  variantOfferPrice?: number[];
  slug: string;
  variantTermSummary?: VariantTermSummary[];
}

export default function ProductCard({
  name,
  category,
  brand,
  thumbnail,
  variantPrice,
  variantOfferPrice,
  slug,
  variantTermSummary,
}: ProductCardInterface) {
  const getCheapestPrice = () => {
    if (variantPrice.length <= 0) {
      return 0;
    }
    return Math.min(...variantPrice);
  };

  const getHighestPrice = () => {
    if (variantPrice.length <= 0) {
      return 0;
    }
    return Math.max(...variantPrice);
  };

  const hasOffer = variantOfferPrice && variantOfferPrice.length > 0;
  const offerMin = hasOffer ? Math.min(...variantOfferPrice) : 0;
  const offerMax = hasOffer ? Math.max(...variantOfferPrice) : 0;

  return (
    <Link href={`/product/${slug}`}>
      <NextImage
        src={IMAGE_URL + (thumbnail ?? "")}
        height={500}
        width={500}
        classNames={{
          image: "object-cover aspect-square",
        }}
        alt={name}
        className="w-full rounded-md"
      ></NextImage>
      <div className="mt-3">
        <div className="flex items-center">
          {category && <p className="text-xs">{category.name}</p>}
          {brand && (
            <div className="flex items-center">
              <span className="mx-1">-</span>
              <p className="text-xs">{brand.name}</p>
            </div>
          )}
        </div>
        <p className="font-bold">{name}</p>

        <div className="flex flex-wrap items-center gap-1">
          {hasOffer ? (
            <>
              <p className="text-sm font-semibold text-red-600">{currencyFormat(offerMin)}</p>
              {offerMin !== offerMax && (
                <p className="text-sm font-semibold text-red-600"> - {currencyFormat(offerMax)}</p>
              )}
              <p className="text-xs text-slate-400 line-through ml-1">{currencyFormat(getCheapestPrice())}</p>
              {getCheapestPrice() !== getHighestPrice() && (
                <p className="text-xs text-slate-400 line-through"> - {currencyFormat(getHighestPrice())}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm">{currencyFormat(getCheapestPrice())}</p>
              {getCheapestPrice() !== getHighestPrice() && (
                <p className="text-sm"> - {currencyFormat(getHighestPrice())}</p>
              )}
            </>
          )}
        </div>

        {variantTermSummary && variantTermSummary.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {variantTermSummary.map((s) => (
              <span
                key={s.typeName}
                className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5"
              >
                {s.typeName}: {s.termNames.join(", ")}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
