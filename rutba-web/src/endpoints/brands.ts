/**
 * WebBrandsEndpoints
 * Storefront-facing endpoint path + params for the /brands resource.
 */
export const WebBrandsEndpoints = {
  /**
   * Fetch all brands with logo populated.
   */
  list: () => ({
    path: "brands",
    params: {
      populate: "logo",
    },
  }),
};
