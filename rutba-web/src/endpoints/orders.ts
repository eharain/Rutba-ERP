/**
 * WebOrdersEndpoints
 * Path + params for web storefront order queries and checkout flows.
 */
export const WebOrdersEndpoints = {
    /**
     * List orders for current web user.
     */
    myOrders: () => ({
        path: 'sale-orders',
        params: {
            populate: {
                customer_contact: true,
                products: {
                    populate: {
                        items: {
                            fields: ['quantity', 'product_name', 'variant', 'variant_name', 'variant_terms'],
                            populate: { image: true },
                        },
                    },
                },
            },
            sort: ['createdAt:desc'],
        },
    }),

    /**
     * Fetch one order by documentId for current web user.
     */
    byId: (documentId: string) => ({
        path: `sale-orders/${documentId}`,
        params: {
            populate: {
                customer_contact: true,
                products: { populate: { items: { populate: { image: true } } } },
            },
        },
    }),

    /** Create a new order (checkout submit). */
    create: () => ({
        path: 'orders',
    }),

    /** Validate checkout address. */
    validateAddress: () => ({
        path: 'orders/checkout/validate-address',
    }),

    /** Fetch shipping rates for checkout parcel/address. */
    shippingRate: () => ({
        path: 'orders/checkout/shipping-rate',
    }),

    /** Calculate delivery methods from cart + destination. */
    calculateDelivery: () => ({
        path: 'orders/calculate-delivery',
    }),

    /**
     * Tracking endpoint (public, uses order_secret).
     */
    tracking: (documentId: string, secret: string) => ({
        path: `orders/tracking/${documentId}`,
        params: { secret },
    }),

    /** Messages for an order (read). */
    messages: (documentId: string) => ({
        path: `orders/${documentId}/messages`,
    }),

    /** Send a message on an order thread. */
    sendMessage: (documentId: string) => ({
        path: `orders/${documentId}/messages`,
    }),
};
