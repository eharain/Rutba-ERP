import Link from "next/link";
import NextImage from "@/components/next-image";
import { IMAGE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { currencyFormat } from "@/lib/use-currency";
import { marked } from "marked";

interface BannerSingleLayoutProps {
  group: CmsProductGroupInterface;
}

export default function BannerSingleLayout({ group }: BannerSingleLayoutProps) {
  const product = (group.products ?? [])[0];
  if (!product) return null;

  const bgImage =
    product.gallery?.[0]?.url ?? product.logo?.url ?? null;
  const price =
    product.variants && product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.selling_price))
      : product.selling_price;

  return (
    <Link href={`/product/${product.documentId}`} className="block group/banner">
      <div
        className="relative w-full h-[40vh] md:h-[50vh] lg:h-[60vh] rounded-lg overflow-hidden"
        style={
          bgImage
            ? {
                backgroundImage: `url(${IMAGE_URL + bgImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { backgroundColor: "#f1f5f9" }
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 text-white">
          <h3 className="text-2xl md:text-4xl font-bold mb-2 group-hover/banner:underline decoration-2 underline-offset-4 transition-all">
            {product.name}
          </h3>
          {group.excerpt && (
            <div
              className="text-sm md:text-base text-white/80 mb-3 line-clamp-2 prose prose-sm prose-invert max-w-xl"
              dangerouslySetInnerHTML={{ __html: marked.parse(group.excerpt) as string }}
            />
          )}
          {price > 0 && (
            <p className="text-lg md:text-xl font-medium text-white/90 mb-4">
              Starting from {currencyFormat(price)}
            </p>
          )}
          <span className="inline-block bg-white text-slate-900 font-semibold px-6 py-2.5 rounded-md text-sm hover:bg-slate-100 transition-colors">
            Shop Now
          </span>
        </div>
      </div>
    </Link>
  );
}
