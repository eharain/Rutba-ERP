import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface ScrollSliderProps {
  children: ReactNode;
  showArrows?: boolean;
  showDots?: boolean;
  autoPlay?: number;
  className?: string;
  slideClassName?: string;
}

export default function ScrollSlider({
  children,
  showArrows = false,
  showDots = false,
  autoPlay = 0,
  className,
  slideClassName,
}: ScrollSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  const getSlides = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.children) as HTMLElement[];
  }, []);

  const updateActiveIndex = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const slides = getSlides();
    if (slides.length === 0) return;
    setSlideCount(slides.length);

    const scrollLeft = el.scrollLeft;
    const containerWidth = el.clientWidth;
    let closest = 0;
    let minDist = Infinity;
    slides.forEach((slide, i) => {
      const dist = Math.abs(slide.offsetLeft - scrollLeft);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIndex(closest);
  }, [getSlides]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateActiveIndex();
    el.addEventListener("scroll", updateActiveIndex, { passive: true });
    return () => el.removeEventListener("scroll", updateActiveIndex);
  }, [updateActiveIndex]);

  useEffect(() => {
    updateActiveIndex();
  }, [children, updateActiveIndex]);

  const scrollTo = useCallback(
    (index: number) => {
      const slides = getSlides();
      if (slides.length === 0) return;
      const target = ((index % slides.length) + slides.length) % slides.length;
      slides[target]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    },
    [getSlides]
  );

  const scrollPrev = useCallback(() => scrollTo(activeIndex - 1), [scrollTo, activeIndex]);
  const scrollNext = useCallback(() => scrollTo(activeIndex + 1), [scrollTo, activeIndex]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || autoPlay <= 0 || slideCount <= 1) return;
    const interval = setInterval(() => {
      scrollTo(activeIndex + 1);
    }, autoPlay);
    return () => clearInterval(interval);
  }, [autoPlay, activeIndex, slideCount, scrollTo]);

  // Keyboard support
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext]
  );

  return (
    <div className="relative group" role="region" aria-roledescription="carousel">
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex overflow-x-auto snap-x snap-mandatory scrollbar-hide",
          "scroll-smooth focus:outline-none",
          className
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {React.Children.map(children, (child, i) => (
          <div
            key={i}
            className={cn("snap-start shrink-0", slideClassName)}
          >
            {child}
          </div>
        ))}
      </div>

      {/* Prev / Next arrows */}
      {showArrows && slideCount > 1 && (
        <>
          <button
            onClick={scrollPrev}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white rounded-full p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            onClick={scrollNext}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white rounded-full p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </>
      )}

      {/* Dot indicators */}
      {showDots && slideCount > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {Array.from({ length: slideCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-all duration-200",
                i === activeIndex
                  ? "bg-slate-800 scale-110"
                  : "bg-slate-300 hover:bg-slate-400"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
