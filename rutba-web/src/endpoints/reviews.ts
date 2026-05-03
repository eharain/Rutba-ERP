/**
 * Storefront product reviews endpoint builders.
 */
export const WebReviewsEndpoints = {
  /**
   * Fetch all visible reviews for a product by slug.
   */
  bySlug: (slug: string) => ({
    path: "product-reviews/",
    params: {
      pagination: { limit: -1 },
      filters: {
        show_review: { $eq: true },
        product: { slug: { $eq: slug } },
      },
    },
  }),

  /**
   * Fetch review count and average rating for a product by slug.
   */
  countBySlug: (slug: string) => ({
    path: `product-reviews/${slug}/count`,
    params: undefined,
  }),
};
