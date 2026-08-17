import axios from "axios";
import qs from "qs";
// Source descriptors — synchronous `{ path, method, params }` shapes. The
// generated proxy under endpoints/ would re-route through the api-provider
// lib, which uses its own storage JWT (NOT the NextAuth session that
// rutba-web actually uses). So we use the descriptors for paths/methods
// only and axios + the session JWT ourselves — same pattern as
// services/me-addresses.ts.
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from "@rutba/api-provider/api/web/orders.js";
import { apiUrl } from "@/static/const";

function authHeaders(jwt?: string | null) {
  return jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
}

// Compose the URL the way the api-provider's `withQuery` helper does: append
// `?<qs>` only when there are params, using bracket-notation for nested
// objects (Strapi's expected populate shape).
function urlWithParams(path: string, params?: Record<string, unknown>) {
  if (!params || Object.keys(params).length === 0) return `${apiUrl(path)}`;
  const query = qs.stringify(params, { encodeValuesOnly: true });
  return `${apiUrl(path)}${query ? `?${query}` : ""}`;
}

export function createWebOrdersService(config = {}) {
  void config;

  /**
   * Public, secret-keyed lookup — no JWT needed.
   */
  const getTransactionWithSecret = async ({
    code,
    secret,
  }: {
    code: string;
    secret: string;
  }) => {
    const ep = WebOrdersEndpointsApi.tracking(code, secret);
    const res = await axios.get(urlWithParams(ep.path, ep.params));
    return res.data;
  };

  /**
   * Authenticated "my orders" — must carry the NextAuth session JWT or
   * Strapi's ensureUser returns 401 and the list comes back empty.
   *
   * Returns `{ data, pagination }` to match the previous service shape so
   * existing callers (profile/orders/index.tsx) keep working.
   */
  const getMyTransaction = async (jwt?: string | null) => {
    if (!jwt) return { data: [], pagination: undefined };
    const ep = WebOrdersEndpointsApi.myOrders();
    const res = await axios.get(urlWithParams(ep.path, ep.params), {
      headers: authHeaders(jwt),
    });
    return {
      data: res.data?.data ?? [],
      pagination: res.data?.meta?.pagination,
    };
  };

  /**
   * Authenticated single-order lookup — same auth pattern as the list call.
   * Strapi's `myOrderDetail` controller enforces ownership server-side.
   */
  const getMyTransactionById = async (
    id: string,
    jwt?: string | null
  ) => {
    if (!id) return null;
    const ep = WebOrdersEndpointsApi.byId(id);
    const res = await axios.get(urlWithParams(ep.path, ep.params), {
      headers: authHeaders(jwt),
    });
    return res.data;
  };

  return {
    endpoints: WebOrdersEndpointsApi,
    getTransactionWithSecret,
    getMyTransaction,
    getMyTransactionById,
  };
}
