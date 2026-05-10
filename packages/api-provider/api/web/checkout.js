export const WebCheckoutEndpoints = {
  validateAddress: (data) => ({
    path: 'orders/checkout/validate-address',
    method: 'post',
    data,
  }),
  shippingRate: (data) => ({
    path: 'orders/checkout/shipping-rate',
    method: 'post',
    data,
  }),
};
