import NextImage from "@/components/next-image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules"; // Import modules

// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

import { useQuery } from "@tanstack/react-query";
import { SkeletonBanner } from "../skeleton";
import { IMAGE_URL } from "@/static/const";
import Link from "next/link";
import { ErrorCard } from "../errors/error-card";
import useBannersService from "@/services/banners";

export default function HeroSlider() {
  const { getBanners } = useBannersService();

  const {
    data: banner,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["hero-slider"],
    queryFn: async () => {
      return await getBanners();
    },
  });

  if (isLoading) {
    return <SkeletonBanner />;
  } else if (isError) {
    return <ErrorCard message={(error as Error).message} />;
  }

  // Fallback if no products are found
  if (!banner?.products || banner.products.length === 0) {
    return null; 
  }

  return (
    <div className="hero-swiper-container">
      <Swiper
        // Install Swiper modules
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={0}
        slidesPerView={1}
        navigation={true}
        pagination={{ clickable: true }}
        loop={banner.products.length > 1} // Only loop if there's more than 1 slide
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        className="w-full"
      >
        {banner.products.map((item) => (
          <SwiperSlide key={"banner-home-" + item.id}>
            <Link href={`/product/${item.documentId}`}>
              <div className="relative w-full h-[30vh] md:h-[45vh] lg:h-[70vh] xl:h-[80vh] overflow-hidden">
                {item.logo?.url && (
                  <NextImage
                    src={IMAGE_URL + item.logo.url}
                    layout="fill"
                    className="object-cover"
                    alt={item.name || "hero-banner"}
                    useSkeleton
                    priority // Highly recommended for Hero images
                  />
                )}
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}