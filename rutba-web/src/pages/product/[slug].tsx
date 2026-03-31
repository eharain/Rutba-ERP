import LayoutMain from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { ShoppingBasket, Star } from "lucide-react";

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
// import Reviews from "@/components/product-detail/reviews";
// import useReviewsService from "@/services/reviews";
import useProductsService from "@/services/products";
import { currencyFormat } from "@/lib/use-currency";
import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";
import { IMAGE_URL } from "@/static/const";
import { CartTermInfo } from "@/types/api/cart";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

export default function ProductDetail() {
  const cartStore = useStoreCart();
  const router = useRouter();
  const { getProductDetail } = useProductsService();

  const { slug } = router.query;

  const { addToCart } = useCartService();

  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["products", slug],
    queryFn: async () => {
      return getProductDetail(slug as string);
    },
    enabled: !!slug,
  });

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

  // Auto-select first variant for no-term products
  useEffect(() => {
    if (!hasTermVariants) {
      setSelectedVariant(product?.variants?.[0]?.id ?? null);
    }
  }, [isLoading, hasTermVariants, product]);

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
        <div className="container mx-auto my-20">
          <ErrorCard message={(error as Error).message}></ErrorCard>
        </div>
      </LayoutMain>
    );
  }

  const canAddToCart = hasTermVariants ? resolvedVariant != null : selectVariant != null;

  return (
    <LayoutMain>
      <div className="container mx-auto my-20">
        <div className="grid grid-cols-12 gap-[15px] lg:gap-[30px]">
          <div className="col-span-12 md:col-span-6 lg:col-span-6">
            <ImageListProduct
              logo={product?.logo}
              imageList={product?.gallery}
              variants={product?.variants}
              selectedVariantId={resolvedVariant?.id ?? selectVariant}
              onVariantSelect={(id) => {
                if (!hasTermVariants) setSelectedVariant(id);
              }}
            ></ImageListProduct>
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between">
              <h2 className="text-2xl font-bold">{product?.name}</h2>
              <p className="text-slate-500">{product?.categories?.[0]?.name}</p>
            </div>

            <hr className="opacity-50" />

            <div className="mt-3">
              {product?.description && (
                <div
                  className="prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{ __html: marked.parse(product.description) as string }}
                />
              )}
            </div>

            {/* ---- TERM-BASED VARIANT SELECTOR ---- */}
            {hasTermVariants && (
              <div className="my-4 space-y-4">
                {variantTermTypes.map((tt) => {
                  const available = availableTermsForType(tt.documentId);
                  return (
                    <div key={tt.documentId}>
                      <label className="text-sm font-bold mb-1.5 block">
                        {tt.name}
                        {termSelection[tt.documentId] && (
                          <span className="font-normal text-slate-500 ml-2">
                            {tt.terms.find((t) => t.documentId === termSelection[tt.documentId])?.name}
                          </span>
                        )}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {tt.terms.map((t) => {
                          const isAvailable = available.has(t.documentId);
                          const isSelected = termSelection[tt.documentId] === t.documentId;
                          return (
                            <Button
                              key={t.documentId}
                              size={"sm"}
                              variant={isSelected ? "secondary" : "outline"}
                              className={cn(
                                "border",
                                isSelected ? "border-black" : "",
                                !isAvailable ? "opacity-30 line-through" : ""
                              )}
                              disabled={!isAvailable}
                              onClick={() => {
                                setTermSelection((prev) => ({
                                  ...prev,
                                  [tt.documentId]: isSelected ? undefined : t.documentId,
                                }));
                              }}
                            >
                              {t.name}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {matchedVariants.length > 1 && Object.values(termSelection).some((v) => v) && (
                  <p className="text-sm text-slate-500">
                    {matchedVariants.length} variants match — select more options to narrow down.
                  </p>
                )}
              </div>
            )}

            {/* ---- PUBLIC TERM SELECTOR ---- */}
            {hasPublicTerms && (
              <div className="my-4 space-y-4">
                {publicTermTypes.map((tt) => {
                  const available = availableTermsForType(tt.documentId);
                  const isExpanded = termSelection[tt.documentId] !== undefined;
                  return (
                    <div key={tt.documentId}>
                      <button
                        type="button"
                        className="text-sm font-bold mb-1.5 flex items-center gap-1.5 w-full text-left"
                        onClick={() => {
                          if (termSelection[tt.documentId] != null) {
                            setTermSelection((prev) => ({
                              ...prev,
                              [tt.documentId]: undefined,
                            }));
                          }
                        }}
                      >
                        <span className={cn(
                          "inline-block transition-transform",
                          isExpanded ? "rotate-90" : ""
                        )}>▶</span>
                        {tt.name}
                        {termSelection[tt.documentId] && (
                          <span className="font-normal text-slate-500 ml-1">
                            — {tt.terms.find((t) => t.documentId === termSelection[tt.documentId])?.name}
                          </span>
                        )}
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {tt.terms.map((t) => {
                          const isAvailable = available.has(t.documentId);
                          const isSelected = termSelection[tt.documentId] === t.documentId;
                          return (
                            <Button
                              key={t.documentId}
                              size={"sm"}
                              variant={isSelected ? "secondary" : "outline"}
                              className={cn(
                                "border",
                                isSelected ? "border-black" : "",
                                !isAvailable ? "opacity-30 line-through" : ""
                              )}
                              disabled={!isAvailable}
                              onClick={() => {
                                setTermSelection((prev) => ({
                                  ...prev,
                                  [tt.documentId]: isSelected ? undefined : t.documentId,
                                }));
                              }}
                            >
                              {t.name}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---- NAME-BASED VARIANT SELECTOR (fallback) ---- */}
            {!hasTermVariants && product?.variants && product.variants.length > 0 && (
              <div className="grid grid-cols-12 gap-[5px] my-4">
                {product.variants.map((item) => {
                  const isAvailable = matchedVariants.some((v) => v.id === item.id);
                  return (
                    <div
                      key={"product-variant-" + item.id}
                      className="col-span-6 md:col-span-4 lg:col-span-4"
                    >
                      <Button
                        onClick={() => setSelectedVariant(item.id)}
                        size={"lg"}
                        variant={
                          selectVariant === item.id ? "secondary" : "outline"
                        }
                        disabled={!isAvailable}
                        className={cn(
                          "w-full border",
                          selectVariant === item.id ? "border-black" : "",
                          !isAvailable ? "opacity-30" : ""
                        )}
                      >
                        {item.name}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              size={"lg"}
              className="w-full"
              disabled={!canAddToCart}
              onClick={() => {
                const variantId = resolvedVariant?.id ?? selectVariant;
                addToCart(product?.id ?? null, variantId, 1, selectedTermsForCart);
                cartStore.setIsCartOpen(true);
              }}
            >
              <div className="flex w-full justify-between items-center">
                <span className="font-bold uppercase flex items-center gap-3">
                  <ShoppingBasket></ShoppingBasket>
                  {canAddToCart ? "Add to Cart" : "Select Options"}
                </span>
                <span className="font-bold">
                  {getPrice != null
                    ? currencyFormat(getPrice as number)
                    : priceRange
                    ? `${currencyFormat(priceRange.min)} – ${currencyFormat(priceRange.max)}`
                    : currencyFormat(product?.selling_price ?? 0)}
                </span>
              </div>
            </Button>
            <Accordion type="multiple" className="mt-8" defaultValue={["delivery"]}>
              <AccordionItem value="delivery" data-state="open">
                <AccordionTrigger>Delivery and Returns</AccordionTrigger>
                <AccordionContent>
                  <p>
                    Standard delivery 6–12 Working Days <br />
                    Express delivery 3–10 Working Days <br /> <br />
                    During checkout, we will provide you with the estimated
                    delivery date based on your order delivery address. Orders
                    are processed and delivered Monday - Thursday and Saturday, Sunday (excluding
                    public holidays). <br /> <br />
                    Enjoy free returns. Exclusions Apply.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </LayoutMain>
  );
}

export async function getServerSideProps() { return { props: {} }; }
