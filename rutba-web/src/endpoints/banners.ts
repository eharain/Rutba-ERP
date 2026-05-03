/**
 * Storefront banner/homepage endpoint builders.
 */
export const WebBannersEndpoints = {
  /**
   * Fetch the home banner (slug: "home-sneak") with product/image population.
   */
  homeBanner: () => ({
    path: "product-groups",
    params: {
      populate: ["cover_image", "products.gallery", "products.logo"],
      filters: { slug: { $eq: "home-sneak" } },
    },
  }),
};
