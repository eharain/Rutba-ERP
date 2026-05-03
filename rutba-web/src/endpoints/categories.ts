/**
 * WebCategoriesEndpoints
 * Storefront-facing endpoint path + params for the /categories resource.
 */
export const WebCategoriesEndpoints = {
  /**
   * Fetch all categories (unpaginated).
   */
  list: () => ({
    path: "categories",
    params: undefined as undefined,
  }),
};
