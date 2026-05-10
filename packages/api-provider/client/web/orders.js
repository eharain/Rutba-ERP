import { WebOrdersEndpoints } from '@/api/web/orders.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebOrdersService(config = {}) {
  const proxy = createWebClientProxy(WebOrdersEndpoints, config);

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
