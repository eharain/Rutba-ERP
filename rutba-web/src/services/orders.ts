import { WebOrdersEndpoints } from '@rutba/api-provider/endpoints/web/orders.js';

export function createWebOrdersService(config = {}) {
  void config;
  const proxy = WebOrdersEndpoints;

  const getTransactionWithSecret = async ({ code, secret }) => {
    return proxy.tracking(code, secret);
  };

  const getMyTransaction = async (jwt) => {
    const res = await proxy.myOrders(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined);
    return {
      data: res?.data ?? [],
      pagination: res?.meta?.pagination,
    };
  };

  const getMyTransactionById = async (id, jwt) => {
    return proxy.byId(id ?? '', jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined);
  };

  return {
    endpoints: proxy,
    getTransactionWithSecret,
    getMyTransaction,
    getMyTransactionById,
  };
}

