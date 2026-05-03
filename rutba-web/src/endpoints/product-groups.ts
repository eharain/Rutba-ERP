/**
 * Storefront product-group endpoint builders.
 */
export const WebProductGroupsEndpoints = {
  /**
   * Fetch a product group by slug with paginated products.
   */
  bySlug: (slug: string, page = 1, pageSize = 24, sort = "createdAt:desc") => ({
    path: `product-groups/by-slug/${encodeURIComponent(slug)}`,
    params: { page, pageSize, sort },
  }),
};
