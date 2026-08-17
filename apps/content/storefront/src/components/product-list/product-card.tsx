import Link from "next/link";
import NextImage from "../next-image";
import { CategoryInterface } from "@/types/api/category";
import { IMAGE_URL } from "@/static/const";
import { BrandInterface } from "@/types/api/brand";
import { currencyFormat } from "@/lib/use-currency";
import { VariantTermSummary } from "@/types/api/product";
import { cn } from "@/lib/utils";

export interface ProductCardInterface {
  name: string;
  category?: Pick<CategoryInterface, "name" | "slug">;
  brand?: Pick<BrandInterface, "name" | "slug">;
  thumbnail: string | null;
  secondaryThumbnail?: string | null;
  variantPrice: number[];
  variantOfferPrice?: number[];
  slug: string;
  variantTermSummary?: VariantTermSummary[];
  offerId?: string;
  sourceGroupId?: string;
  createdAt?: string;
}

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

export default function ProductCard({
  name,
  category,
  brand,
  thumbnail,
  secondaryThumbnail,
  variantPrice,
  variantOfferPrice,
  slug,
  variantTermSummary,
  offerId,
  sourceGroupId,
  createdAt,
}: ProductCardInterface) {
  const cheapest = variantPrice.length ? Math.min(...variantPrice) : 0;
  const highest = variantPrice.length ? Math.max(...variantPrice) : 0;

  const hasOffer = !!variantOfferPrice && variantOfferPrice.length > 0;
  const offerMin = hasOffer ? Math.min(...variantOfferPrice!) : 0;
  const offerMax = hasOffer ? Math.max(...variantOfferPrice!) : 0;

  const savingsPct =
    hasOffer && cheapest > 0
      ? Math.round(((cheapest - offerMin) / cheapest) * 100)
      : 0;

  const isNew =
    !!createdAt && Date.now() - new Date(createdAt).getTime() < FOURTEEN_DAYS;

  // groupId alone is enough — the server resolves the offer for this product
  // within that group. offerId is kept for explicit offer attribution when a
  // caller has one (e.g. an offer-pinned card), but it's no longer required.
  const productHref = (() => {
    if (!sourceGroupId) return `/product/${slug}`;
    const qs = new URLSearchParams();
    qs.set("groupId", sourceGroupId);
    if (offerId) qs.set("offerId", offerId);
    return `/product/${slug}?${qs.toString()}`;
  })();

  return (
    <Link
      href={productHref}
      className="group block focus:outline-none"
      aria-label={name}
    >
      <div className="relative overflow-hidden rounded-xl bg-secondary/40 aspect-square">
        {/* Primary image */}
        <NextImage
          src={IMAGE_URL + (thumbnail ?? "")}
          height={600}
          width={600}
          classNames={{
            image: cn(
              "object-cover aspect-square w-full h-full",
              "transition-transform duration-600 ease-smooth",
              "group-hover:scale-[1.06]"
            ),
          }}
          alt={name}
          className="w-full"
        />

        {/* Hover swap image (only if a second gallery image exists) */}
        {secondaryThumbnail && (
          <NextImage
            src={IMAGE_URL + secondaryThumbnail}
            height={600}
            width={600}
            classNames={{
              image: cn(
                "object-cover aspect-square w-full h-full absolute inset-0",
                "opacity-0 transition-opacity duration-500 ease-smooth",
                "group-hover:opacity-100"
              ),
            }}
            alt={name}
            className="w-full absolute inset-0"
          />
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {hasOffer && savingsPct > 0 && (
            <span className="inline-flex items-center rounded-full bg-brand text-brand-foreground text-[11px] font-bold tracking-wide px-2 py-1 shadow-card">
              -{savingsPct}%
            </span>
          )}
          {isNew && !hasOffer && (
            <span className="inline-flex items-center rounded-full bg-foreground text-background text-[11px] font-bold tracking-wide px-2 py-1 shadow-card">
              NEW
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 px-0.5">
        {(category || brand) && (
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {category && <span>{category.name}</span>}
            {category && brand && <span aria-hidden>·</span>}
            {brand && <span>{brand.name}</span>}
          </div>
        )}

        <p className="mt-1 font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-brand transition-colors duration-200">
          {name}
        </p>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {hasOffer ? (
            <>
              <span className="text-base font-bold text-brand">
                {currencyFormat(offerMin)}
                {offerMin !== offerMax && ` – ${currencyFormat(offerMax)}`}
              </span>
              <span className="text-sm text-muted-foreground line-through">
                {currencyFormat(cheapest)}
                {cheapest !== highest && ` – ${currencyFormat(highest)}`}
              </span>
            </>
          ) : (
            <span className="text-base font-semibold text-foreground">
              {currencyFormat(cheapest)}
              {cheapest !== highest && ` – ${currencyFormat(highest)}`}
            </span>
          )}
        </div>

        {variantTermSummary && variantTermSummary.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {variantTermSummary.map((s) => (
              <span
                key={s.typeName}
                className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5"
              >
                {s.termNames.join(" · ")}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
