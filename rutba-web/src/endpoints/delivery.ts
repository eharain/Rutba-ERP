/**
 * WebDeliveryEndpoints
 * Storefront order delivery/tracking/message endpoints.
 */
export const WebDeliveryEndpoints = {
  /** Calculate delivery methods for destination + cart shape. */
  calculateMethods: () => ({
    path: "orders/calculate-delivery",
  }),

  /** Get order thread messages. */
  getMessages: (documentId: string) => ({
    path: `orders/${documentId}/messages`,
  }),

  /** Post order thread message. */
  sendMessage: (documentId: string) => ({
    path: `orders/${documentId}/messages`,
  }),

  /** Public secret-based order tracking. */
  tracking: (documentId: string, secret: string) => ({
    path: `orders/tracking/${documentId}`,
    params: { secret },
  }),
};
