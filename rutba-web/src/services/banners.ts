import axios from "axios";
import { BASE_URL } from "@/static/const";
import { BannerInterface } from "@/types/api/banner";

export default function useBannersService() {
  /**
   * Retrieves the banners from the API.
   *
   * @return {BannerInterface} A banner object.
   */
  const getBanners = async () => {
    const req = await axios.get(BASE_URL + "product-groups", {
      params: {
        populate: ["cover_image", "products.gallery", "products.logo"],
        filters: {
          slug: {
            $eq: "home-sneak",
          },
        },
      },
    });
    
    return req.data.data[0] as BannerInterface;
  };

  return {
    getBanners,
  };
}
