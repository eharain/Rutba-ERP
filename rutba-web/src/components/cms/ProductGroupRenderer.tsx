import { useState } from "react";
import { marked } from "marked";
import { cn } from "@/lib/utils";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import GroupHeader, { type SortOption, type ViewMode } from "./layouts/GroupHeader";
import HeroSliderLayout from "./layouts/HeroSliderLayout";
import Grid4Layout from "./layouts/Grid4Layout";
import Grid6Layout from "./layouts/Grid6Layout";
import CarouselLayout from "./layouts/CarouselLayout";
import BannerSingleLayout from "./layouts/BannerSingleLayout";
import ListLayout from "./layouts/ListLayout";

interface ProductGroupRendererProps {
  group: CmsProductGroupInterface;
  even?: boolean;
  /** Max products to show inline. If group has more, a "View All" link appears. 0 = no limit. */
  maxInlineProducts?: number;
}

const NO_CONTROLS_LAYOUTS = new Set(["hero-slider", "banner-single"]);

export default function ProductGroupRenderer({
  group,
  even = false,
  maxInlineProducts,
}: ProductGroupRendererProps) {
  // Use group-level setting, then prop override, then default 12
  const effectiveMax = maxInlineProducts ?? group.max_inline_products ?? 12;
  const layout = group.layout || "grid-4";
  const hideControls = NO_CONTROLS_LAYOUTS.has(layout);

  const [sort, setSort] = useState<SortOption>(group.default_sort || "default");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");

  const showSort = !hideControls && group.enable_sort_dropdown !== false;
  const showViewToggle = !hideControls && group.enable_view_toggle !== false;

  const allProducts = group.products ?? [];
  if (allProducts.length === 0) return null;

  // Resolve active offer from offers relation
  const now = Date.now();
  const activeOffer = (group.offers ?? []).find(o => {
    if (!o.active) return false;
    if (o.start_date && new Date(o.start_date).getTime() > now) return false;
    if (o.end_date && new Date(o.end_date).getTime() < now) return false;
    return true;
  });

  const upcomingOffer = !activeOffer
    ? (group.offers ?? []).find(o =>
        o.active && !!o.start_date && new Date(o.start_date).getTime() > now
      )
    : undefined;

  const offerActive = !!activeOffer;
  const activeOfferId = activeOffer?.documentId;
  const groupDocId = group.documentId;

  const totalProducts = allProducts.length;
  const hasMore = effectiveMax > 0 && totalProducts > effectiveMax;
  const viewAllHref = group.slug ? `/product-groups/${group.slug}` : undefined;

  // Limit products for inline display
  const limitedGroup = hasMore
    ? { ...group, products: allProducts.slice(0, effectiveMax) }
    : group;

  const renderLayout = () => {
    if (viewMode === "detailed" && !hideControls) {
      return <ListLayout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
    }

    switch (layout) {
      case "hero-slider":
        return <HeroSliderLayout group={limitedGroup} />;
      case "grid-4":
        return <Grid4Layout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
      case "grid-6":
        return <Grid6Layout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
      case "carousel":
        return <CarouselLayout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
      case "banner-single":
        return <BannerSingleLayout group={limitedGroup} />;
      case "list":
        return <ListLayout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
      default:
        return <Grid4Layout group={limitedGroup} sort={sort} offerActive={offerActive} offerId={activeOfferId} sourceGroupId={groupDocId} />;
    }
  };

  const isFullWidth = layout === "hero-slider" || layout === "banner-single";

  return (
    <section
      className={
        even ? "bg-slate-50 py-12 md:py-16" : "bg-white py-12 md:py-16"
      }
    >
      <div className={isFullWidth ? "" : "container-fluid"}>
        {(activeOffer || upcomingOffer) && (
          <OfferBanner
            name={(activeOffer || upcomingOffer)!.name}
            active={!!activeOffer}
            startDate={(activeOffer || upcomingOffer)!.start_date}
            endDate={(activeOffer || upcomingOffer)!.end_date}
          />
        )}
        {!hideControls && (
          <GroupHeader
            name={group.title || group.name}
            excerpt={group.excerpt}
            sort={sort}
            onSortChange={setSort}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showSort={showSort}
            showViewToggle={showViewToggle}
            viewAllHref={hasMore ? viewAllHref : undefined}
            totalProducts={hasMore ? totalProducts : undefined}
          />
        )}
        {renderLayout()}
        {group.content && (
          <div
            className={cn(
              "mt-6 prose prose-slate max-w-none prose-img:rounded-lg prose-a:text-blue-600",
              isFullWidth ? "container-fluid" : ""
            )}
            dangerouslySetInnerHTML={{ __html: marked.parse(group.content) as string }}
          />
        )}
      </div>
    </section>
  );
}

/* ── Offer Banner ── */

function OfferBanner({
  name,
  active,
  startDate,
  endDate,
}: {
  name?: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
}) {
  const label = name || (active ? "Special Offer" : "Upcoming Offer");

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (active) {
    return (
      <div className="mb-4 rounded-lg bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <span className="font-semibold text-sm md:text-base">{label}</span>
        </div>
        {endDate && (
          <span className="text-xs md:text-sm opacity-90">
            Ends {formatDate(endDate)}
          </span>
        )}
      </div>
    );
  }

  // Upcoming
  return (
    <div className="mb-4 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">⏳</span>
        <span className="font-semibold text-sm md:text-base">{label}</span>
      </div>
      {startDate && (
        <span className="text-xs md:text-sm opacity-90">
          Starts {formatDate(startDate)}
        </span>
      )}
    </div>
  );
}
