export const WebReviewsEndpoints = {
  bySlug: (slug) => ({
    path: 'product-reviews/',
    method: 'get',
    params: {
      pagination: { limit: -1 },
      filters: {
        show_review: { $eq: true },
        product: { slug: { $eq: slug } },
      },
    },
  }),

  countBySlug: (slug) => ({
    path: `product-reviews/${slug}/count`,
    method: 'get',
  }),
};
