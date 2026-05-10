import { WebCheckoutEndpoints } from '@/api/web/checkout.js';
import { WebOrdersEndpoints } from '@/api/web/orders.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebCheckoutService(config = {}) {
  const checkoutProxy = createWebClientProxy(WebCheckoutEndpoints, config);
  const ordersProxy = createWebClientProxy(WebOrdersEndpoints, config);

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
