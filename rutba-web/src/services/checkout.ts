import { WebCheckoutEndpoints } from '@rutba/api-provider/endpoints/web/checkout.js';
import { WebOrdersEndpoints } from '@rutba/api-provider/endpoints/web/orders.js';

export function createWebCheckoutService(config = {}) {
  void config;
  const checkoutProxy = WebCheckoutEndpoints;
  const ordersProxy = WebOrdersEndpoints;

  const validateAddress = async (data) => {
    return checkoutProxy.validateAddress({ data });
  };

  const getShippingRate = async (data) => {
    return checkoutProxy.shippingRate({
      address: { ...data.address },
      parcel: data.parcel,
    });
  };

  const checkoutItem = async (data) => {
    const res = await ordersProxy.create({ data });
    return res?.data ?? res;
  };

  return {
    checkoutEndpoints: checkoutProxy,
    ordersEndpoints: ordersProxy,
    validateAddress,
    getShippingRate,
    checkoutItem,
  };
}

