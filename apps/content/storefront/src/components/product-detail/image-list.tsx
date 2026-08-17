import { IMAGE_URL } from "@/static/const";
import { ImageInterface } from "@/types/api/image";
import { ProductInterface } from "@/types/api/product";
import { cn } from "@/lib/utils";

import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Check,
  MousePointerClick,
  ImageIcon,
} from "lucide-react";

interface ImageEntry {
  image: ImageInterface;
  variantId: number | null;
}

const FALLBACK = "/images/fallback-image.png";

function resolve(url?: string | null) {
  if (!url) return FALLBACK;
  if (/^https?:\/\//i.test(url)) return url;
  return IMAGE_URL + url;
}

export default function ImageListProduct({
  logo,
  imageList,
  variants,
  selectedVariantId,
  onVariantSelect,
  onImageChange,
  lightboxFooter,
}: {
  logo?: ImageInterface;
  imageList?: ImageInterface[];
  variants?: ProductInterface[];
  selectedVariantId?: number | null;
  onVariantSelect?: (variantId: number) => void;
  onImageChange?: (relativeUrl: string | null) => void;
  /** Optional node rendered as a sticky footer inside the fullscreen lightbox
   *  so primary actions (Add to Cart, price) stay reachable while viewing
   *  expanded images. */
  lightboxFooter?: React.ReactNode;
}) {
  const allEntries = useMemo<ImageEntry[]>(() => {
    const entries: ImageEntry[] = [];
    const usedIds = new Set<number>();

    if (logo) {
      entries.push({ image: logo, variantId: null });
      usedIds.add(logo.id);
    }

    imageList?.forEach((img) => {
      if (img && !usedIds.has(img.id)) {
        entries.push({ image: img, variantId: null });
        usedIds.add(img.id);
      }
    });

    variants?.forEach((variant) => {
      if (variant.logo && !usedIds.has(variant.logo.id)) {
        entries.push({ image: variant.logo, variantId: variant.id });
        usedIds.add(variant.logo.id);
      }
      variant.gallery?.forEach((img) => {
        if (img && !usedIds.has(img.id)) {
          entries.push({ image: img, variantId: variant.id });
          usedIds.add(img.id);
        }
      });
    });

    return entries;
  }, [logo, imageList, variants]);

  const [activeIndex, setActiveIndex] = useState(0);
  // previewIndex is a *temporary* override driven by thumbnail hover. It
  // never notifies the parent and never changes the selected variant —
  // only a click commits, which keeps cart/variant state predictable.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [hasUserSelected, setHasUserSelected] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);

  // Reset to first image whenever the underlying list changes (e.g. variant
  // group switch loaded a different image set).
  useEffect(() => {
    setActiveIndex(0);
    setPreviewIndex(null);
    setHasUserSelected(false);
  }, [allEntries.length]);

  const safeIndex = Math.min(activeIndex, Math.max(0, allEntries.length - 1));
  const active = allEntries[safeIndex];
  const displayIndex =
    previewIndex != null && previewIndex >= 0 && previewIndex < allEntries.length
      ? previewIndex
      : safeIndex;
  const display = allEntries[displayIndex] ?? active;
  const hasMulti = allEntries.length > 1;
  const showHint = hasMulti && !hasUserSelected;

  // Notify parent of the currently-displayed image (relative URL — matches the
  // old contract so cart payloads keep working).
  useEffect(() => {
    onImageChange?.(active?.image?.url ?? null);
  }, [active, onImageChange]);

  // External variant selection → jump to that variant's first image.
  useEffect(() => {
    if (selectedVariantId == null) return;
    const idx = allEntries.findIndex((e) => e.variantId === selectedVariantId);
    if (idx >= 0 && idx !== safeIndex) {
      setActiveIndex(idx);
      setHasUserSelected(true);
    }
  }, [selectedVariantId, allEntries, safeIndex]);

  const selectIndex = useCallback(
    (i: number) => {
      const next = ((i % allEntries.length) + allEntries.length) % allEntries.length;
      setActiveIndex(next);
      setPreviewIndex(null); // commit clears any in-flight hover preview
      setHasUserSelected(true);
      const entry = allEntries[next];
      if (entry?.variantId != null && onVariantSelect) {
        onVariantSelect(entry.variantId);
      }
    },
    [allEntries, onVariantSelect]
  );

  const next = useCallback(() => selectIndex(safeIndex + 1), [selectIndex, safeIndex]);
  const prev = useCallback(() => selectIndex(safeIndex - 1), [selectIndex, safeIndex]);

  // Keep the active thumbnail visible in its rail.
  useEffect(() => {
    const rail = thumbRailRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-thumb="${safeIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [safeIndex]);

  // Keyboard navigation — global when lightbox open, scoped otherwise.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, next, prev]);

  // Lock body scroll while lightbox is open.
  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  if (allEntries.length === 0) {
    return (
      <div className="aspect-square rounded-2xl bg-secondary/40 border border-border flex items-center justify-center">
        <div className="text-muted-foreground flex flex-col items-center gap-2">
          <ImageIcon className="h-10 w-10 opacity-50" />
          <span className="text-sm">No images yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero ── */}
      <div className="relative">
        <div
          ref={heroRef}
          onMouseMove={hasMulti ? handleMouseMove : undefined}
          onMouseEnter={() => setPreviewIndex(null)}
          onMouseLeave={() => setZoom(null)}
          onClick={() => setLightboxOpen(true)}
          className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary/40 border border-border cursor-zoom-in shadow-card"
        >
          {/* The hero uses a plain <img> so we can apply CSS transform-origin
              based zoom without fighting next/image's intrinsic sizing. The
              src follows `display` (which == active unless a thumbnail is
              being hovered), so the hero acts as a live preview. */}
          <img
            src={resolve(display.image.url)}
            alt={display.image.alternativeText || "product"}
            className={cn(
              "w-full h-full object-cover select-none transition-transform duration-500 ease-out",
              zoom ? "scale-[1.6]" : "scale-100"
            )}
            style={
              zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined
            }
            draggable={false}
          />

          {/* Soft top gradient so the counter/badges stay legible on bright photos */}
          {hasMulti && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent"
            />
          )}

          {/* Counter pill — reflects what's currently shown (preview or
              committed). When previewing a non-committed thumb we tag it
              "Preview" so users know the click hasn't landed yet. */}
          {hasMulti && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold tracking-wider">
              <span>
                {displayIndex + 1} / {allEntries.length}
              </span>
              {previewIndex != null && previewIndex !== safeIndex && (
                <span className="text-[10px] font-semibold text-white/70 uppercase">
                  · Preview
                </span>
              )}
            </div>
          )}

          {/* Fullscreen button — always available, more visible on hover */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            aria-label="Open fullscreen"
            className="absolute top-3 left-3 h-9 w-9 rounded-full bg-black/55 hover:bg-black/80 backdrop-blur-sm text-white flex items-center justify-center transition-all opacity-70 group-hover:opacity-100"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          {/* "Select an image" hint — only when multiple images and user
              hasn't engaged yet. Sits at the bottom of the hero and pulses
              softly to draw the eye without screaming. */}
          {showHint && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand text-brand-foreground text-xs font-bold tracking-wide shadow-card motion-safe:animate-pulse">
                <MousePointerClick className="h-3.5 w-3.5" />
                Select an image · {allEntries.length} to explore
              </div>
            </div>
          )}

          {/* Hero prev/next (desktop, on hover) */}
          {hasMulti && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Previous image"
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/90 hover:bg-background border border-border items-center justify-center text-foreground shadow-card opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Next image"
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/90 hover:bg-background border border-border items-center justify-center text-foreground shadow-card opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Mobile-only dot pager — quick visual indicator of position */}
        {hasMulti && (
          <div className="md:hidden mt-3 flex justify-center gap-1.5">
            {allEntries.map((_, i) => (
              <button
                key={"dot-" + i}
                type="button"
                onClick={() => selectIndex(i)}
                aria-label={`Image ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeIndex
                    ? "w-6 bg-brand"
                    : "w-1.5 bg-foreground/25 hover:bg-foreground/50"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Thumbnail rail ── */}
      {hasMulti && (
        <div
          ref={thumbRailRef}
          role="listbox"
          aria-label="Product images"
          onMouseLeave={() => setPreviewIndex(null)}
          className={cn(
            "grid gap-2.5",
            allEntries.length <= 3 && "grid-cols-3",
            allEntries.length === 4 && "grid-cols-4",
            allEntries.length >= 5 && "grid-cols-4 sm:grid-cols-5 md:grid-cols-6"
          )}
        >
          {allEntries.map((entry, i) => {
            const isActive = i === safeIndex;
            const isPreview = !isActive && i === previewIndex;
            const isVariantImg = entry.variantId != null;
            const dimmed =
              isVariantImg &&
              selectedVariantId != null &&
              entry.variantId !== selectedVariantId;
            return (
              <button
                key={"thumb-" + entry.image.id}
                type="button"
                role="option"
                aria-selected={isActive ? "true" : "false"}
                data-thumb={i}
                onClick={() => selectIndex(i)}
                onMouseEnter={() => setPreviewIndex(i)}
                onFocus={() => setPreviewIndex(i)}
                onBlur={() => setPreviewIndex(null)}
                className={cn(
                  "relative aspect-square rounded-xl overflow-hidden bg-secondary/40 transition-all duration-300 ease-out",
                  "ring-offset-2 ring-offset-background",
                  isActive
                    ? "ring-2 ring-brand scale-[1.02] shadow-card"
                    : isPreview
                    ? "ring-2 ring-foreground/60 scale-[1.02]"
                    : "ring-1 ring-border hover:ring-foreground/40 hover:scale-[1.02]",
                  dimmed && "opacity-40 hover:opacity-70"
                )}
              >
                <img
                  src={resolve(entry.image.url)}
                  alt={entry.image.alternativeText || "thumbnail"}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  draggable={false}
                />

                {/* Active check badge */}
                {isActive && (
                  <span className="absolute top-1.5 right-1.5 bg-brand text-brand-foreground rounded-full p-0.5 shadow-card">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}

                {/* Subtle pulsing ring on inactive thumbs while the hint is
                    showing — telegraphs "these are clickable" without being
                    obnoxious. Skipped under reduce-motion. */}
                {showHint && !isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-brand/40 motion-safe:animate-pulse"
                  />
                )}

                {/* Variant indicator dot — tiny visual cue that clicking this
                    thumb will also switch the displayed variant. */}
                {isVariantImg && (
                  <span
                    aria-hidden
                    title="Variant image"
                    className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full bg-white border border-foreground/60 shadow-sm"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col motion-safe:animate-[fadeIn_200ms_ease-out]"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Product image viewer"
        >
          <div className="flex items-center justify-between p-4">
            <span className="text-white/80 text-sm font-semibold tracking-wide">
              {safeIndex + 1} / {allEntries.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(false);
              }}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label="Close fullscreen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center px-4 relative min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              key={"lb-" + active.image.id}
              src={resolve(active.image.url)}
              alt={active.image.alternativeText || "product"}
              className="max-h-full max-w-full object-contain motion-safe:animate-[fadeIn_250ms_ease-out]"
              draggable={false}
            />

            {hasMulti && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous image"
                  className="absolute left-4 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next image"
                  className="absolute right-4 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {hasMulti && (
            <div
              className="p-4 flex justify-center gap-2 overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {allEntries.map((entry, i) => (
                <button
                  key={"lb-thumb-" + entry.image.id}
                  type="button"
                  onClick={() => selectIndex(i)}
                  aria-label={`View image ${i + 1}`}
                  className={cn(
                    "h-16 w-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all",
                    i === safeIndex
                      ? "border-white opacity-100 scale-105"
                      : "border-transparent opacity-50 hover:opacity-90"
                  )}
                >
                  <img
                    src={resolve(entry.image.url)}
                    alt={entry.image.alternativeText || "thumbnail"}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Sticky action footer — keeps the Add-to-Cart CTA reachable
              while the lightbox is open. Stops click propagation so taps
              on the bar don't close the viewer. */}
          {lightboxFooter && (
            <div
              className="border-t border-white/10 bg-black/80 backdrop-blur-md px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxFooter}
            </div>
          )}
        </div>
      )}

      {/* Local @keyframes for a soft cross-fade — Tailwind's built-in
          animations don't include a one-shot fade, and adding it to the
          config for one component would be overkill. */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
