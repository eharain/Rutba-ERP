import { useQuery } from "@tanstack/react-query";
import ProductCard from "./product-card";
import ScrollSlider from "@/components/ui/scroll-slider";
import { createWebProductGroupsService } from "@/services";
import { BASE_URL } from "@/static/const";
import { getProductCardProps } from "@/components/cms/layouts/sort-products";
import { findLiveOffer, useOfferClock } from "@/lib/offer-live";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { cn } from "@/lib/utils";

interface GroupRailProps {
  /**
   * The container the shopper arrived through — the `groupId` query on
   * /product/<slug>. May be a slug OR a documentId: productHref forwards
   * `group.slug || group.documentId`. The by-slug endpoint resolves both
   * (it falls back to a documentId lookup the same way the offer resolver
   * and findPublicDetail already do).
   */
  groupId?: string;
  /** The product being viewed — never advertise it back to itself. */
  excludeDocumentId?: string;
  /** Cards to render. Matches the recently-viewed rail. */
  limit?: number;
  className?: string;
}

/**
 * "More from this group" — the sideways step that keeps the shopper inside the
 * container they arrived through.
 *
 * Every card forwards the same groupId, which is the whole point: the offer
 * context has to survive the next click, or the shopper walks from a discounted
 * grid onto an undiscounted product page.
 *
 * Renders nothing at all without a groupId (a bare /product/<slug> visit has no
 * container to be "more from"), when the group can't be resolved, or when
 * fewer than two other products remain.
 */
export default function GroupRail({
  groupId,
  excludeDocumentId,
  limit = 8,
  className,
}: GroupRailProps) {
  const productGroupsService = createWebProductGroupsService({ baseURL: BASE_URL });

  // Same view-time gate as the detail page and the group listings — this rail
  // must not become a fourth place where the liveness rule is rewritten.
  const now = useOfferClock();

  const { data } = useQuery({
    queryKey: ["group-rail", groupId, limit],
    // Fetch one more than we render: the current product usually sits inside
    // the group, and dropping it would otherwise leave the rail a card short.
    queryFn: () => productGroupsService.getProductGroupBySlug(groupId as string, 1, limit + 1),
    enabled: !!groupId,
    staleTime: 60_000,
    // A missing or unpublished group is a non-event for a secondary rail —
    // don't retry, just render nothing.
    retry: false,
  });

  const group = (data as { data?: CmsProductGroupInterface } | undefined)?.data;
  if (!groupId || !group) return null;

  const products = (group.products ?? [])
    .filter((p) => p.documentId !== excludeDocumentId)
    .slice(0, limit);
  if (products.length < 2) return null;

  const activeOffer = findLiveOffer(group.offers, now);
  const offerActive = !!activeOffer;
  // Forward the canonical key rather than whatever the URL happened to carry,
  // so the next page's offer lookup takes the slug path.
  const forwardGroupId = group.slug || group.documentId;
  const groupLabel = group.title || group.name;

  return (
    <section className={className ?? "py-16 md:py-20 bg-background"}>
      <div className="container-fluid">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Keep exploring</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              {groupLabel ? `More from ${groupLabel}` : "More from this collection"}
            </h2>
          </div>
          {group.slug && (
            <a
              href={`/product-groups/${encodeURIComponent(group.slug)}`}
              className="text-sm font-semibold text-brand hover:text-foreground transition-colors whitespace-nowrap"
            >
              View all →
            </a>
          )}
        </div>

        <ScrollSlider
          showArrows
          slideClassName={cn("w-[75vw] sm:w-[45vw] md:w-[30vw] lg:w-[18vw] pr-3")}
        >
          {products.map((item) => (
            <ProductCard
              key={"gr-" + item.documentId}
              {...getProductCardProps(item, {
                offerActive,
                offerId: activeOffer?.documentId,
                sourceGroupId: forwardGroupId,
              })}
            />
          ))}
        </ScrollSlider>
      </div>
    </section>
  );
}
