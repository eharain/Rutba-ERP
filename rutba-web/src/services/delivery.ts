import axios from 'axios';
import { BASE_URL } from '@/static/const';
import { DeliveryMethodOption, OrderMessage, OrderTracking } from '@/types/api/delivery';
import { WebDeliveryEndpoints } from '@/endpoints';

export default function useDeliveryService() {
  /**
   * Fetch available delivery methods for the buyer's cart + destination.
   * Called after the buyer enters their shipping address.
   */
  const getDeliveryMethods = async (params: {
    productGroupDocumentIds: string[];
    destination: { city: string; country: string };
    weightKg?: number;
    cartTotal: number;
  }): Promise<DeliveryMethodOption[]> => {
    const ep = WebDeliveryEndpoints.calculateMethods();
    const res = await axios.post(BASE_URL + ep.path, params);
    return (res.data?.data || []) as DeliveryMethodOption[];
  };

  /**
   * Get messages for a specific order (polling).
   */
  const getOrderMessages = async (orderDocumentId: string, jwt?: string): Promise<OrderMessage[]> => {
    const headers = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    const ep = WebDeliveryEndpoints.getMessages(orderDocumentId);
    const res = await axios.get(BASE_URL + ep.path, { headers });
    return (res.data?.data || []) as OrderMessage[];
  };

  /**
   * Send a message to the rider for an order.
   */
  const sendOrderMessage = async (
    orderDocumentId: string,
    message: string,
    jwt: string
  ): Promise<OrderMessage> => {
    const ep = WebDeliveryEndpoints.sendMessage(orderDocumentId);
    const res = await axios.post(
      BASE_URL + ep.path,
      { message },
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    return res.data?.data as OrderMessage;
  };

  /**
   * Get public order tracking data (no auth needed — uses order_secret).
   */
  const getOrderTracking = async (orderDocumentId: string, secret: string): Promise<OrderTracking> => {
    const ep = WebDeliveryEndpoints.tracking(orderDocumentId, secret);
    const res = await axios.get(BASE_URL + ep.path, {
      params: ep.params,
    });
    return res.data?.data as OrderTracking;
  };

  return { getDeliveryMethods, getOrderMessages, sendOrderMessage, getOrderTracking };
}
