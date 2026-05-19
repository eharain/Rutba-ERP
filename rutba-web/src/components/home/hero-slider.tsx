import NextImage from "@/components/next-image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, EffectFade } from "swiper/modules";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-fade";

import { useQuery } from "@tanstack/react-query";
import { SkeletonBanner } from "../skeleton";
import { BASE_URL, IMAGE_URL } from "@/static/const";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ErrorCard } from "../errors/error-card";
import { createWebBannersService } from "@/services/";

export default function HeroSlider() {
  const bannersService = createWebBannersService({ baseURL: BASE_URL });

  const {
    data: banner,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["hero-slider"],
    queryFn: async () => bannersService.getBanners(),
  });

  if (isLoading) return <SkeletonBanner />;
  if (isError) return <ErrorCard message={(error as Error).message} />;
  if (!banner?.products || banner.products.length === 0) return null;

  const multiple = banner.products.length > 1;

  return (
    <div className="hero-swiper-container relative">
      <Swiper
        modules={[Navigation, Pagination, Autoplay, EffectFade]}
        effect={multiple ? "fade" : undefined}
        fadeEffect={{ crossFade: true }}
        spaceBetween={0}
        slidesPerView={1}
        navigation={multiple}
        pagination={multiple ? { clickable: true } : false}
        loop={multiple}
        autoplay={
          multiple
            ? { delay: 6000, disableOnInteraction: false, pauseOnMouseEnter: true }
            : false
        }
        className="w-full"
      >
        {banner.products.map((item, idx) => (
          <SwiperSlide key={"banner-home-" + item.id}>
            <Link href={`/product/${encodeURIComponent(item.slug || item.documentId)}`} className="block group">
              <div className="relative w-full h-[60vh] md:h-[70vh] lg:h-[82vh] overflow-hidden bg-secondary">
                {item.logo?.url && (
                  <NextImage
                    src={IMAGE_URL + item.logo.url}
                    fill
                    className="object-cover scale-100 group-hover:scale-[1.03] transition-transform duration-1200 ease-smooth"
                    alt={item.name || "hero-banner"}
                    useSkeleton
                    priority={idx === 0}
                  />
                )}

                {/* Legibility gradient — bottom for caption, subtle top for nav contrast */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
                />

                {/* Caption */}
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-12 lg:p-16">
                  <div className="container-fluid max-w-5xl">
                    {item.name && (
                      <p className="text-white/80 text-xs md:text-sm uppercase tracking-[0.22em] font-semibold mb-3">
                        Featured
                      </p>
                    )}
                    <h2 className="font-display text-white text-3xl md:text-5xl lg:text-6xl font-bold leading-[1.05] max-w-3xl drop-shadow-sm">
                      {item.name}
                    </h2>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white text-foreground text-sm font-semibold pl-5 pr-2 py-2 shadow-card group-hover:bg-brand group-hover:text-brand-foreground transition-colors">
                      <span>Shop Now</span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background group-hover:bg-brand-foreground group-hover:text-brand transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
