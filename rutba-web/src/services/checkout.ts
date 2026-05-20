import axios from "axios";
import { WebCheckoutEndpoints } from "@rutba/api-provider/endpoints/web/checkout.js";
import { WebOrdersEndpoints } from "@rutba/api-provider/endpoints/web/orders.js";
// Raw descriptor — same reason as orders.ts / me-addresses.ts: the generated
// proxy routes through api-provider's storage-JWT, which rutba-web doesn't
// populate (auth lives in the NextAuth session). For the order-create call
// we want the descriptor for path/method only and axios+Bearer ourselves.
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from "@rutba/api-provider/api/web/orders.js";
import { BASE_URL } from "@/static/const";

function authHeaders(jwt?: string | null) {
  return jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
}

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

  /**
   * Place an order. When a NextAuth JWT is supplied, the request goes out
   * with a Bearer header so Strapi's create controller can resolve
   * ctx.state.user and stamp `owners` — that's what makes the order show up
   * later in /profile/orders. Guest checkout (no jwt) still works because
   * the route is `auth: false`.
   */
  const checkoutItem = async (data, jwt) => {
    const ep = WebOrdersEndpointsApi.create({ data });
    const res = await axios.post(
      `${BASE_URL}${ep.path}`,
      { data: ep.data?.data ?? data },
      { headers: { "Content-Type": "application/json", ...(authHeaders(jwt) || {}) } }
    );
    return res.data?.data ?? res.data;
  };

  return {
    checkoutEndpoints: checkoutProxy,
    ordersEndpoints: ordersProxy,
    validateAddress,
    getShippingRate,
    checkoutItem,
  };
}
