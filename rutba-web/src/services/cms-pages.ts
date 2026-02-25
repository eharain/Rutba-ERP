import axios from "axios";
import { BASE_URL } from "@/static/const";
import { CmsPageInterface, CmsPageDetailInterface } from "@/types/api/cms-page";

export default function useCmsPagesService() {
  const getCmsPages = async () => {
    const req = await axios.get(BASE_URL + "cms-pages", {
      params: {
        sort: ["sort_order:asc", "createdAt:desc"],
        populate: ["featured_image"],
        pagination: { pageSize: 50 },
      },
    });

    return req.data.data as CmsPageInterface[];
  };

  const getCmsPageBySlug = async (slug: string) => {
    const req = await axios.get(BASE_URL + "cms-pages", {
      params: {
        filters: { slug: { $eq: slug } },
        populate: [
          "featured_image",
          "gallery",
          "hero_product_groups.products.gallery",
          "hero_product_groups.products.logo",
          "hero_product_groups.products.brands",
          "hero_product_groups.products.categories",
          "hero_product_groups.products.variants",
          "hero_product_groups.cover_image",
          "brand_groups.brands.logo",
          "product_groups.products.gallery",
          "product_groups.products.logo",
          "product_groups.products.brands",
          "product_groups.products.categories",
          "product_groups.products.variants",
          "product_groups.cover_image",
          "related_pages.featured_image",
        ],
      },
    });

    const pages = req.data.data as CmsPageDetailInterface[];
    return pages.length > 0 ? pages[0] : null;
  };

  return {
    getCmsPages,
    getCmsPageBySlug,
  };
}
