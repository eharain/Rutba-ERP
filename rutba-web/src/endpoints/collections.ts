/**
 * WebCollectionsEndpoints
 * Storefront-facing endpoint path + params for the /collections resource.
 */
export const WebCollectionsEndpoints = {
  /**
   * Fetch all collections with image populated.
   */
  list: () => ({
    path: "collections",
    params: {
      pagination: { limit: -1 },
      populate: ["image"],
    },
  }),
};
