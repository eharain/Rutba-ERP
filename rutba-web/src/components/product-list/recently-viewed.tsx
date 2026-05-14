import { useEffect, useState } from "react";
import { useRecentlyViewed } from "@/store/store-recently-viewed";
import ProductCard from "./product-card";
import ScrollSlider from "@/components/ui/scroll-slider";

interface RecentlyViewedProps {
  excludeDocumentId?: string;
  title?: string;
  eyebrow?: string;
  className?: string;
}

export default function RecentlyViewed({
  excludeDocumentId,
  title = "Recently viewed",
  eyebrow = "Pick up where you left off",
  className,
}: RecentlyViewedProps) {
  // Avoid SSR / hydration mismatch — Zustand-persist hydrates after mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const items = useRecentlyViewed((s) => s.items);
  if (!hydrated) return null;

  const visible = items.filter((i) => i.documentId !== excludeDocumentId);
  if (visible.length < 2) return null;

  return (
    <section className={className ?? "py-16 md:py-20 bg-secondary/30"}>
      <div className="container-fluid">
        <div className="mb-8">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            {title}
          </h2>
        </div>

        <ScrollSlider
          showArrows
          slideClassName="w-[75vw] sm:w-[45vw] md:w-[30vw] lg:w-[18vw] pr-3"
        >
          {visible.map((i) => (
            <ProductCard
              key={"rv-" + i.documentId}
              name={i.name}
              slug={i.slug}
              thumbnail={i.thumbnail}
              secondaryThumbnail={i.secondaryThumbnail ?? null}
              variantPrice={[i.sellingPrice]}
              variantOfferPrice={
                i.offerPrice && i.offerPrice > 0 ? [i.offerPrice] : undefined
              }
              category={i.categoryName ? { name: i.categoryName, slug: "" } : undefined}
              brand={i.brandName ? { name: i.brandName, slug: "" } : undefined}
            />
          ))}
        </ScrollSlider>
      </div>
    </section>
  );
}
