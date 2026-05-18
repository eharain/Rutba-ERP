import LayoutMain from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { ChevronRight, ShoppingBasket, Truck, Shield, RotateCcw, Star } from "lucide-react";
import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import ImageListProduct from "@/components/product-detail/image-list";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCartService } from "@/services/cart";
import { ErrorCard } from "@/components/errors/error-card";
import { useStoreCart } from "@/store/store-cart";
import { useRecentlyViewed } from "@/store/store-recently-viewed";
import RecentlyViewed from "@/components/product-list/recently-viewed";
import Seo from "@/components/seo/seo";
import ProductJsonLd from "@/components/seo/product-json-ld";
// import Reviews from "@/components/product-detail/reviews";
// import useReviewsService from "@/services/reviews";
import { createWebProductsService, getProductDetailSSR } from "@/services";
import { currencyFormat } from "@/lib/use-currency";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";
import { IMAGE_URL, BASE_URL } from "@/static/const";
import { CartTermInfo } from "@/types/api/cart";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

export const getServerSideProps: GetServerSideProps<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialProduct: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialOfferContext: any | null;
  slug: string;
}> = async (context) => {
  const slug = context.params?.slug as string;
  const groupId = typeof context.query?.groupId === 'string' ? context.query.groupId : undefined;
  try {
    const res = await getProductDetailSSR(slug, groupId);
    const product = res?.data ?? null;
    if (!product) return { notFound: true };
    return {
      props: {
        initialProduct: product,
        initialOfferContext: res?.meta?.offerContext ?? null,
        slug,
      },
    };
  } catch {
    return { props: { initialProduct: null, initialOfferContext: null, slug } };
  }
};

export default function ProductDetail({
  initialProduct,
  initialOfferContext,
  slug: ssrSlug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const cartStore = useStoreCart();
  const router = useRouter();
  const productsService = createWebProductsService({ baseURL: BASE_URL });

  const slug = (router.query.slug as string) ?? ssrSlug;
  const sourceGroupId = router.query.groupId as string | undefined;

  const { addToCart } = useCartService();

  // Single source of truth: the server resolves offer context based on
  // (product, group). The detail page used to validate an `offerId` client-
  // side, but with the group-driven offer model the editor controls which
  // offer applies — the storefront just renders what the server returns.
  const {
    data: detail,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["products", slug, sourceGroupId ?? null],
    queryFn: async () => {
      return productsService.getProductDetail(slug as string, sourceGroupId);
    },
    enabled: !!slug,
    initialData:
      initialProduct
        ? { data: initialProduct, offerContext: initialOfferContext ?? null }
        : undefined,
    staleTime: 60_000,
  });
  const product = detail?.data;
  const offerContext = detail?.offerContext ?? null;
  const offerActive = !!offerContext?.offer;

  // Extract variant term types (is_variant: true) used across all variants
  const variantTermTypes = useMemo(() => {
    if (!product?.variants) return [];
    const typeMap = new Map<
      string,
      { documentId: string; name: string; terms: Map<string, { documentId: string; name: string }> }
    >();
    product.variants.forEach((v) => {
      (v.terms || []).forEach((t) => {
        (t.term_types || []).forEach((tt) => {
          if (tt.is_variant) {
            const key = tt.documentId || String(tt.id);
            if (!typeMap.has(key)) {
              typeMap.set(key, { documentId: key, name: tt.name, terms: new Map() });
            }
            const tKey = t.documentId || String(t.id);
            typeMap.get(key)!.terms.set(tKey, { documentId: tKey, name: t.name });
          }
        });
      });
    });
    return Array.from(typeMap.values()).map((tt) => ({
      ...tt,
      terms: Array.from(tt.terms.values()),
    }));
  }, [product]);

  // Extract public (non-variant) term types used across all variants
  const publicTermTypes = useMemo(() => {
    if (!product?.variants) return [];
    const variantTypeIds = new Set(variantTermTypes.map((tt) => tt.documentId));
    const typeMap = new Map<
      string,
      { documentId: string; name: string; terms: Map<string, { documentId: string; name: string }> }
    >();
    product.variants.forEach((v) => {
      (v.terms || []).forEach((t) => {
        (t.term_types || []).forEach((tt) => {
          if (tt.is_public && !tt.is_variant) {
            const key = tt.documentId || String(tt.id);
            if (variantTypeIds.has(key)) return;
            if (!typeMap.has(key)) {
              typeMap.set(key, { documentId: key, name: tt.name, terms: new Map() });
            }
            const tKey = t.documentId || String(t.id);
            typeMap.get(key)!.terms.set(tKey, { documentId: tKey, name: t.name });
          }
        });
      });
    });
    return Array.from(typeMap.values()).map((tt) => ({
      ...tt,
      terms: Array.from(tt.terms.values()),
    }));
  }, [product, variantTermTypes]);

  const hasTermVariants = variantTermTypes.length > 0;
  const hasPublicTerms = publicTermTypes.length > 0;

  // Term selection state: { [termTypeDocId]: termDocId } — shared for variant and public terms
  const [termSelection, setTermSelection] = useState<Record<string, string | undefined>>({});

  // Classic variant selection (fallback for no-terms variants)
  const [selectVariant, setSelectedVariant] = useState<number | null>(null);

  // Track the image currently displayed in the gallery
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  // Filter variants by current term selection (both variant and public terms)
  const matchedVariants = useMemo(() => {
    if (!product?.variants) return [];
    const entries = Object.entries(termSelection).filter(([, v]) => v != null);
    if (entries.length === 0) return product.variants;
    return product.variants.filter((v) =>
      entries.every(([ttDocId, tDocId]) =>
        (v.terms || []).some(
          (t) =>
            (t.documentId || String(t.id)) === tDocId &&
            (t.term_types || []).some(
              (tt) => (tt.documentId || String(tt.id)) === ttDocId
            )
        )
      )
    );
  }, [product, termSelection]);

  // Compute which terms are available for a given term type based on other selections
  const availableTermsForType = (ttDocId: string): Set<string> => {
    if (!product?.variants) return new Set();
    const otherSelections = Object.entries(termSelection).filter(
      ([k, v]) => k !== ttDocId && v != null
    );
    const compatibleVariants = product.variants.filter((v) =>
      otherSelections.every(([otherTtDocId, otherTDocId]) =>
        (v.terms || []).some(
          (t) =>
            (t.documentId || String(t.id)) === otherTDocId &&
            (t.term_types || []).some(
              (tt) => (tt.documentId || String(tt.id)) === otherTtDocId
            )
        )
      )
    );
    const termIds = new Set<string>();
    compatibleVariants.forEach((v) => {
      (v.terms || []).forEach((t) => {
        (t.term_types || []).forEach((tt) => {
          if ((tt.documentId || String(tt.id)) === ttDocId && (tt.is_variant || tt.is_public)) {
            termIds.add(t.documentId || String(t.id));
          }
        });
      });
    });
    return termIds;
  };

  // The resolved single variant (if selection narrows to exactly one)
  const resolvedVariant = useMemo(() => {
    if (hasTermVariants) {
      return matchedVariants.length === 1 ? matchedVariants[0] : null;
    }
    if (selectVariant) {
      return matchedVariants.find((v) => v.id === selectVariant) ?? null;
    }
    return null;
  }, [hasTermVariants, matchedVariants, selectVariant]);

  // Price display
  const getPrice = useMemo(() => {
    if (resolvedVariant) return resolvedVariant.selling_price;
    if (hasTermVariants && matchedVariants.length > 1) {
      const prices = matchedVariants.map((v) => v.selling_price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? min : null; // null means show range
    }
    return product?.selling_price;
  }, [resolvedVariant, hasTermVariants, matchedVariants, product]);

  // Apply the server-resolved offer to a (selling_price, offer_price) pair.
  // Mirrors the resolver in sale-offer service so per-variant prices line up
  // with the per-product price the server already computed.
  const applyOffer = (selling: number, productOfferPrice?: number): number | null => {
    if (!offerContext?.offer || !offerActive) return null;
    const base = Number(selling) || 0;
    const mode = offerContext.offer.discount_mode;
    const value = Number(offerContext.offer.discount_value) || 0;
    if (mode === "percent_off") {
      const pct = Math.max(0, Math.min(100, value));
      const next = Math.max(0, base * (1 - pct / 100));
      return next < base ? next : null;
    }
    if (mode === "fixed_off") {
      const off = Math.max(0, value);
      const next = Math.max(0, base - off);
      return next < base ? next : null;
    }
    if (mode === "use_product_offer_price") {
      const op = Number(productOfferPrice) || 0;
      return op > 0 && op < base ? op : null;
    }
    return null;
  };

  // Offer price display — derived from the server-resolved offerContext,
  // applied per variant so ranged products keep their min/max math.
  const getOfferPrice = useMemo(() => {
    if (!offerActive) return null;
    if (resolvedVariant) return applyOffer(resolvedVariant.selling_price, resolvedVariant.offer_price);
    if (hasTermVariants && matchedVariants.length > 1) {
      const prices = matchedVariants
        .map((v) => applyOffer(v.selling_price, v.offer_price))
        .filter((p): p is number => p != null);
      if (prices.length === 0) return null;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? min : null;
    }
    return product ? applyOffer(product.selling_price, product.offer_price) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerActive, offerContext, resolvedVariant, hasTermVariants, matchedVariants, product]);

  const offerPriceRange = useMemo(() => {
    if (!offerActive || !hasTermVariants || matchedVariants.length <= 1) return null;
    const prices = matchedVariants
      .map((v) => applyOffer(v.selling_price, v.offer_price))
      .filter((p): p is number => p != null);
    if (prices.length === 0) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerActive, offerContext, hasTermVariants, matchedVariants]);

  const priceRange = useMemo(() => {
    if (hasTermVariants && matchedVariants.length > 1) {
      const prices = matchedVariants.map((v) => v.selling_price);
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }
    return null;
  }, [hasTermVariants, matchedVariants]);

  // Build term info for cart (includes both variant and public terms)
  const selectedTermsForCart = useMemo((): CartTermInfo[] => {
    const allTypes = [...variantTermTypes, ...publicTermTypes];
    return allTypes
      .filter((tt) => termSelection[tt.documentId] != null)
      .map((tt) => {
        const term = tt.terms.find((t) => t.documentId === termSelection[tt.documentId]);
        return { typeName: tt.name, termName: term?.name || "" };
      })
      .filter((t) => t.termName);
  }, [variantTermTypes, publicTermTypes, termSelection]);

  // Resolved summary & description: prefer variant content when selected, fall back to product
  const displaySummary = useMemo(() => {
    if (resolvedVariant?.summary) return resolvedVariant.summary;
    return product?.summary || "";
  }, [resolvedVariant, product]);

  const displayDescription = useMemo(() => {
    if (resolvedVariant?.description) return resolvedVariant.description;
    return product?.description || "";
  }, [resolvedVariant, product]);

  // Auto-select first variant for no-term products
  useEffect(() => {
    if (!hasTermVariants) {
      setSelectedVariant(product?.variants?.[0]?.id ?? null);
    }
  }, [isLoading, hasTermVariants, product]);

  // Record this product in the recently-viewed store (client-side only)
  const pushRecentlyViewed = useRecentlyViewed((s) => s.push);
  useEffect(() => {
    if (!product?.documentId || !product?.name) return;
    pushRecentlyViewed({
      documentId: product.documentId,
      slug: product.documentId,
      name: product.name,
      thumbnail: product.gallery?.[0]?.url ?? product.logo?.url ?? null,
      secondaryThumbnail: product.gallery?.[1]?.url ?? null,
      sellingPrice: product.selling_price ?? 0,
      offerPrice: product.offer_price && product.offer_price > 0 ? product.offer_price : undefined,
      categoryName: product.categories?.[0]?.name,
      brandName: product.brands?.[0]?.name,
    });
  }, [product?.documentId, product?.name, pushRecentlyViewed]);

  // Auto-select terms when only one option per term type (variant + public)
  useEffect(() => {
    const allTypes = [...variantTermTypes, ...publicTermTypes];
    if (allTypes.length > 0) {
      const autoSelection: Record<string, string> = {};
      allTypes.forEach((tt) => {
        if (tt.terms.length === 1) {
          autoSelection[tt.documentId] = tt.terms[0].documentId;
        }
      });
      if (Object.keys(autoSelection).length > 0) {
        setTermSelection(autoSelection);
      }
    }
  }, [variantTermTypes, publicTermTypes]);

  if (isLoading) {
    return (
      <LayoutMain>
        <SkeletonProductDetail></SkeletonProductDetail>
      </LayoutMain>
    );
  } else if (isError) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20">
          <ErrorCard message={(error as Error).message}></ErrorCard>
        </div>
      </LayoutMain>
    );
  }

  const hasVariants = (product?.variants?.length ?? 0) > 0;
  const canAddToCart = !hasVariants || (hasTermVariants ? resolvedVariant != null : selectVariant != null);

  const category = product?.categories?.[0];
  const brand = product?.brands?.[0];
  const savingsPct =
    getOfferPrice != null && typeof getPrice === "number" && getPrice > 0
      ? Math.round(((getPrice - getOfferPrice) / getPrice) * 100)
      : 0;

  const handleAddToCart = () => {
    if (!canAddToCart) return;
    const variantId = resolvedVariant?.id ?? selectVariant;
    // The price honored at checkout reflects the group offer in play right
    // now. We pass the resolved final price (when present) so the server-side
    // cart record matches what the customer saw on the page.
    const resolvedFinalPrice =
      offerActive && resolvedVariant
        ? applyOffer(resolvedVariant.selling_price, resolvedVariant.offer_price) ?? undefined
        : undefined;
    addToCart(
      product?.id ?? null,
      variantId,
      1,
      selectedTermsForCart,
      selectedImageUrl,
      resolvedFinalPrice,
      offerActive ? (offerContext?.offer?.documentId ?? offerContext?.offer?.id) : undefined,
      offerActive ? sourceGroupId : undefined
    );
    cartStore.setIsCartOpen(true);
  };

  // Strip markdown for SEO meta — keep the first decent paragraph.
  const seoDescription =
    (displaySummary || product?.summary || product?.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_~`>\[\]()!|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || undefined;

  const seoKeywords = [
    product?.name,
    category?.name,
    brand?.name,
    ...(product?.categories?.map((c) => c.name) ?? []),
    ...(product?.brands?.map((b) => b.name) ?? []),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <LayoutMain>
      {/* Canonical URL strips any group/offer query params so search engines
          see one URL per product even though clicks from different groups
          may surface different prices. */}
      {product?.documentId && (
        <Head>
          <link rel="canonical" href={`/product/${product.documentId}`} />
        </Head>
      )}
      <Seo
        title={product?.seo_meta?.meta_title || product?.name}
        description={product?.seo_meta?.meta_description || seoDescription}
        keywords={(() => {
          const raw = product?.seo_meta?.keywords;
          if (typeof raw === "string" && raw.trim()) {
            return raw.split(",").map((k) => k.trim()).filter(Boolean);
          }
          return seoKeywords;
        })()}
        image={
          product?.seo_meta?.og_image?.url ||
          product?.gallery?.[0]?.url ||
          product?.logo?.url
        }
        noindex={!!product?.seo_meta?.noindex}
        type="product"
      />
      {product?.name && (
        <ProductJsonLd
          name={product.name}
          description={seoDescription}
          slug={product.documentId}
          images={product.gallery ?? (product.logo ? [{ url: product.logo.url }] : [])}
          brand={brand?.name}
          category={category?.name}
          price={
            typeof getPrice === "number"
              ? (getPrice as number)
              : (product.selling_price ?? 0)
          }
          offerPrice={typeof getOfferPrice === "number" ? (getOfferPrice as number) : undefined}
        />
      )}
      <div className="container-fluid pt-6 md:pt-8 pb-20 md:pb-28">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 text-xs md:text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <Link
            href="/product"
            className="hover:text-foreground transition-colors"
          >
            Products
          </Link>
          {category && (
            <>
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
              <Link
                href={`/product?category=${category.slug}`}
                className="hover:text-foreground transition-colors"
              >
                {category.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <span className="text-foreground font-medium truncate max-w-[40ch]">
            {product?.name}
          </span>
        </nav>

        <div className="grid grid-cols-12 gap-6 lg:gap-12">
          {/* Gallery */}
          <div className="col-span-12 md:col-span-6 lg:col-span-7">
            <ImageListProduct
              logo={product?.logo}
              imageList={product?.gallery}
              variants={product?.variants}
              selectedVariantId={resolvedVariant?.id ?? selectVariant}
              onVariantSelect={(id) => {
                if (!hasTermVariants) setSelectedVariant(id);
              }}
              onImageChange={setSelectedImageUrl}
            />
          </div>

          {/* Info / CTA — sticky on desktop */}
          <div className="col-span-12 md:col-span-6 lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              {(brand || category) && (
                <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-brand mb-2">
                  {[brand?.name, category?.name].filter(Boolean).join(" · ")}
                </p>
              )}

              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                {product?.name}
              </h1>

              {/* Price block */}
              <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {getOfferPrice != null ? (
                  <>
                    <span className="font-display text-3xl md:text-4xl font-bold text-brand">
                      {currencyFormat(getOfferPrice)}
                    </span>
                    {getPrice != null && (
                      <span className="text-lg text-muted-foreground line-through">
                        {currencyFormat(getPrice as number)}
                      </span>
                    )}
                    {savingsPct > 0 && (
                      <span className="inline-flex items-center rounded-full bg-brand text-brand-foreground text-xs font-bold tracking-wide px-2.5 py-1">
                        Save {savingsPct}%
                      </span>
                    )}
                  </>
                ) : offerPriceRange ? (
                  <span className="font-display text-3xl md:text-4xl font-bold text-brand">
                    {currencyFormat(offerPriceRange.min)} – {currencyFormat(offerPriceRange.max)}
                  </span>
                ) : (
                  <span className="font-display text-3xl md:text-4xl font-bold text-foreground">
                    {getPrice != null
                      ? currencyFormat(getPrice as number)
                      : priceRange
                      ? `${currencyFormat(priceRange.min)} – ${currencyFormat(priceRange.max)}`
                      : currencyFormat(product?.selling_price ?? 0)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Inclusive of all taxes
              </p>

              {/* Group-level promos surfaced as badges. Free shipping is
                  resolved server-side from the group's offer set so it can
                  ride alongside a price discount (e.g. "20% off + free
                  shipping" expressed as two offers on the same group). */}
              {(offerContext?.freeShipping || offerContext?.offer?.name) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {offerContext?.offer?.name && (
                    <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 text-brand text-[11px] font-bold tracking-wide px-2.5 py-1">
                      {offerContext.offer.name}
                    </span>
                  )}
                  {offerContext?.freeShipping && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-secondary text-foreground text-[11px] font-bold tracking-wide px-2.5 py-1">
                      <Truck className="h-3 w-3" /> Free shipping
                    </span>
                  )}
                </div>
              )}

              <div className="h-px bg-border my-6" />

              {/* Summary (short, above the fold) */}
              {displaySummary && (
                <div
                  className="prose prose-sm max-w-none text-muted-foreground prose-p:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: marked.parse(displaySummary) as string }}
                />
              )}

              {/* Term selectors */}
              {hasTermVariants && (
                <div className="mt-6 space-y-5">
                  {variantTermTypes.map((tt) => {
                    const available = availableTermsForType(tt.documentId);
                    const selectedName = tt.terms.find(
                      (t) => t.documentId === termSelection[tt.documentId]
                    )?.name;
                    return (
                      <div key={tt.documentId}>
                        <div className="flex items-baseline justify-between mb-2.5">
                          <span className="text-sm font-bold uppercase tracking-wide">
                            {tt.name}
                          </span>
                          {selectedName && (
                            <span className="text-sm text-muted-foreground">
                              {selectedName}
                            </span>
                          )}
                        </div>
                        <TermPicker
                          tt={tt}
                          available={available}
                          selectedId={termSelection[tt.documentId]}
                          onSelect={(termId) =>
                            setTermSelection((prev) => ({
                              ...prev,
                              [tt.documentId]:
                                prev[tt.documentId] === termId
                                  ? undefined
                                  : termId,
                            }))
                          }
                        />
                      </div>
                    );
                  })}

                  {matchedVariants.length > 1 &&
                    Object.values(termSelection).some((v) => v) && (
                      <p className="text-sm text-muted-foreground">
                        {matchedVariants.length} variants match — select more
                        options to narrow down.
                      </p>
                    )}
                </div>
              )}

              {hasPublicTerms && (
                <div className="mt-6 space-y-5">
                  {publicTermTypes.map((tt) => {
                    const available = availableTermsForType(tt.documentId);
                    const selectedName = tt.terms.find(
                      (t) => t.documentId === termSelection[tt.documentId]
                    )?.name;
                    return (
                      <div key={tt.documentId}>
                        <div className="flex items-baseline justify-between mb-2.5">
                          <span className="text-sm font-bold uppercase tracking-wide">
                            {tt.name}
                          </span>
                          {selectedName && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setTermSelection((prev) => ({
                                  ...prev,
                                  [tt.documentId]: undefined,
                                }))
                              }
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <TermPicker
                          tt={tt}
                          available={available}
                          selectedId={termSelection[tt.documentId]}
                          onSelect={(termId) =>
                            setTermSelection((prev) => ({
                              ...prev,
                              [tt.documentId]:
                                prev[tt.documentId] === termId
                                  ? undefined
                                  : termId,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {!hasTermVariants &&
                product?.variants &&
                product.variants.length > 0 && (
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {product.variants.map((item) => {
                      const isAvailable = matchedVariants.some(
                        (v) => v.id === item.id
                      );
                      const isSelected = selectVariant === item.id;
                      return (
                        <button
                          key={"product-variant-" + item.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => setSelectedVariant(item.id)}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-sm font-medium transition-all",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background hover:border-foreground/40",
                            !isAvailable && "opacity-40 line-through cursor-not-allowed"
                          )}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                )}

              {/* Primary CTA */}
              <Button
                size="lg"
                className="w-full mt-8 h-14 rounded-full text-base font-bold tracking-wide group"
                disabled={!canAddToCart}
                onClick={handleAddToCart}
              >
                <ShoppingBasket className="h-5 w-5 mr-2 transition-transform group-hover:scale-110" />
                {canAddToCart ? "Add to Cart" : "Select Options"}
              </Button>

              {/* Trust strip */}
              <ul className="mt-6 grid grid-cols-3 gap-3 text-center">
                <TrustItem icon={<Truck className="h-4 w-4" />} label="Free delivery" sub="On qualifying orders" />
                <TrustItem icon={<RotateCcw className="h-4 w-4" />} label="Easy returns" sub="14-day window" />
                <TrustItem icon={<Shield className="h-4 w-4" />} label="Secure checkout" sub="Encrypted" />
              </ul>

              {/* Details accordion */}
              <Accordion
                type="multiple"
                className="mt-8"
                defaultValue={[
                  ...(displayDescription ? ["description"] : []),
                  "delivery",
                ]}
              >
                {displayDescription && (
                  <AccordionItem value="description">
                    <AccordionTrigger className="text-sm font-semibold uppercase tracking-wide">
                      Description
                    </AccordionTrigger>
                    <AccordionContent>
                      <div
                        className="prose prose-sm max-w-none prose-p:leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(displayDescription) as string,
                        }}
                      />
                    </AccordionContent>
                  </AccordionItem>
                )}
                <AccordionItem value="delivery">
                  <AccordionTrigger className="text-sm font-semibold uppercase tracking-wide">
                    Delivery &amp; Returns
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="prose prose-sm max-w-none text-muted-foreground">
                      <p>
                        Standard delivery 6–12 working days. Express delivery
                        3–10 working days.
                      </p>
                      <p>
                        During checkout, we'll provide an estimated delivery
                        date based on your shipping address. Orders are
                        processed Monday–Thursday and weekends (excluding
                        public holidays).
                      </p>
                      <p>Enjoy free returns. Exclusions apply.</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </div>

      <RecentlyViewed excludeDocumentId={product?.documentId} />

      {/* Mobile sticky Add-to-Cart bar — sticks to the bottom on phones so
          the CTA is always reachable. The desktop right column already
          handles this via `lg:sticky`. */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md shadow-card">
        <div className="container-fluid py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {product?.name}
            </p>
            <p className="font-display font-bold text-foreground leading-tight">
              {getOfferPrice != null ? (
                <>
                  <span className="text-brand">
                    {currencyFormat(getOfferPrice)}
                  </span>
                  {getPrice != null && (
                    <span className="text-xs text-muted-foreground line-through ml-1.5">
                      {currencyFormat(getPrice as number)}
                    </span>
                  )}
                </>
              ) : (
                currencyFormat(
                  typeof getPrice === "number"
                    ? (getPrice as number)
                    : product?.selling_price ?? 0
                )
              )}
            </p>
          </div>
          <Button
            size="lg"
            disabled={!canAddToCart}
            onClick={handleAddToCart}
            className="h-12 px-5 rounded-full text-sm font-bold tracking-wide shrink-0"
          >
            <ShoppingBasket className="h-4 w-4 mr-2" />
            {canAddToCart ? "Add" : "Pick options"}
          </Button>
        </div>
      </div>
      {/* Spacer so the sticky bar doesn't cover the last bit of content */}
      <div aria-hidden className="lg:hidden h-20" />
    </LayoutMain>
  );
}

/* ─── Helpers ─── */

function TrustItem({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <li className="rounded-xl border border-border bg-card p-3 flex flex-col items-center gap-1">
      <span className="text-brand">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{sub}</span>
    </li>
  );
}

// Renders a list of terms as chips. If the term-type name contains "color"
// the chips become circular swatches (best-effort lookup via CSS named colors).
function TermPicker({
  tt,
  available,
  selectedId,
  onSelect,
}: {
  tt: { documentId: string; name: string; terms: { documentId: string; name: string }[] };
  available: Set<string>;
  selectedId: string | undefined;
  onSelect: (termId: string) => void;
}) {
  const isColor = /colou?r/i.test(tt.name);

  if (isColor) {
    return (
      <div className="flex flex-wrap gap-2.5">
        {tt.terms.map((t) => {
          const isAvailable = available.has(t.documentId);
          const isSelected = selectedId === t.documentId;
          return (
            <button
              key={t.documentId}
              type="button"
              disabled={!isAvailable}
              onClick={() => onSelect(t.documentId)}
              aria-label={t.name}
              title={t.name}
              className={cn(
                "relative h-9 w-9 rounded-full border-2 transition-all",
                isSelected ? "border-foreground ring-2 ring-offset-2 ring-foreground" : "border-border hover:border-foreground/40",
                !isAvailable && "opacity-30 cursor-not-allowed"
              )}
              style={{ backgroundColor: cssColorFor(t.name) }}
            >
              {!isAvailable && (
                <span className="absolute inset-0 flex items-center justify-center text-foreground/60 text-lg">×</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tt.terms.map((t) => {
        const isAvailable = available.has(t.documentId);
        const isSelected = selectedId === t.documentId;
        return (
          <button
            key={t.documentId}
            type="button"
            disabled={!isAvailable}
            onClick={() => onSelect(t.documentId)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-all",
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:border-foreground/40",
              !isAvailable && "opacity-40 line-through cursor-not-allowed"
            )}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

const COLOR_ALIASES: Record<string, string> = {
  charcoal: "#36454F",
  cream: "#FFFDD0",
  beige: "#F5F5DC",
  tan: "#D2B48C",
  navy: "#001F3F",
  rose: "#FF66B2",
  mint: "#98FB98",
  sand: "#C2B280",
  burgundy: "#800020",
  ivory: "#FFFFF0",
  off: "#FAFAFA",
};

function cssColorFor(name: string): string {
  const key = name.toLowerCase().trim().replace(/\s+/g, "");
  if (COLOR_ALIASES[key]) return COLOR_ALIASES[key];
  // Browser tolerates unknown values — falls back to a neutral via inline test
  return name.toLowerCase().replace(/\s+/g, "");
}

