import axios from 'axios';
import { BASE_URL } from '@/static/const';
import { DeliveryMethodOption, OrderMessage, OrderTracking } from '@/types/api/delivery';

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
    const res = await axios.post(BASE_URL + 'orders/calculate-delivery', params);
    return (res.data?.data || []) as DeliveryMethodOption[];
  };

  /**
   * Get messages for a specific order (polling).
   */
  const getOrderMessages = async (orderDocumentId: string, jwt?: string): Promise<OrderMessage[]> => {
    const headers = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    const res = await axios.get(BASE_URL + `orders/${orderDocumentId}/messages`, { headers });
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
    const res = await axios.post(
      BASE_URL + `orders/${orderDocumentId}/messages`,
      { message },
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    return res.data?.data as OrderMessage;
  };

  /**
   * Get public order tracking data (no auth needed — uses order_secret).
   */
  const getOrderTracking = async (orderDocumentId: string, secret: string): Promise<OrderTracking> => {
    const res = await axios.get(BASE_URL + `orders/tracking/${orderDocumentId}`, {
      params: { secret },
    });
    return res.data?.data as OrderTracking;
  };

  return { getDeliveryMethods, getOrderMessages, sendOrderMessage, getOrderTracking };
}
