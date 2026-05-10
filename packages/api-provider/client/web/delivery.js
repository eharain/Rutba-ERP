import { WebDeliveryEndpoints } from '@/api/web/delivery.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebDeliveryService(config = {}) {
  const proxy = createWebClientProxy(WebDeliveryEndpoints, config);

  const getDeliveryMethods = async (params) => {
    const res = await proxy.calculateMethods(params);
    return res?.data ?? [];
  };

  const getOrderMessages = async (orderDocumentId, jwt) => {
    const headers = jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
    const res = await proxy.getMessages(orderDocumentId, headers ? { headers } : undefined);
    return res?.data ?? [];
  };

  const sendOrderMessage = async (orderDocumentId, message, jwt) => {
    const data = { message };
    const res = await proxy.sendMessage(
      orderDocumentId,
      data,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    return res?.data;
  };

  const getOrderTracking = async (orderDocumentId, secret) => {
    const res = await proxy.tracking(orderDocumentId, secret);
    return res?.data;
  };

  return { endpoints: proxy, getDeliveryMethods, getOrderMessages, sendOrderMessage, getOrderTracking };
}
