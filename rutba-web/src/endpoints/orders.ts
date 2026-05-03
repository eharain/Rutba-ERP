/**
 * WebOrdersEndpoints
 * Path + params for /sale-orders (web storefront order queries).
 */
export const WebOrdersEndpoints = {
    /**
     * List orders for the current user.
     * @param {string} userEmail
     */
    myOrders: (userEmail: string) => ({
        path: 'sale-orders',
        params: {
            filters: { user_id: { $eq: userEmail } },
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
        },
    }),

    /**
     * Fetch a single order by id with items populated.
     * @param {string} id
     */
    byId: (id: string) => ({
        path: `sale-orders/${id}`,
        params: {
            populate: {
                products: { populate: { items: { populate: { image: true } } } },
            },
        },
    }),

    /**
     * Tracking endpoint (public, uses order_secret).
     * @param {string} code  order code
     * @param {string} secret
     */
    tracking: (code: string, secret: string) => ({
        path: `sale-orders/tracking/${code}`,
        params: { secret },
    }),

    /** Messages for an order. @param {string} orderDocumentId */
    messages: (orderDocumentId: string) => ({
        path: `orders/${orderDocumentId}/messages`,
    }),
};
