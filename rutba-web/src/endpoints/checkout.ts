/**
 * WebCheckoutEndpoints
 * Storefront checkout utility endpoints.
 */
export const WebCheckoutEndpoints = {
  /** Validate shipping/address payload before checkout. */
  validateAddress: () => ({
    path: "orders/checkout/validate-address",
  }),

  /** Get shipping rate quote for checkout. */
  shippingRate: () => ({
    path: "orders/checkout/shipping-rate",
  }),
};
