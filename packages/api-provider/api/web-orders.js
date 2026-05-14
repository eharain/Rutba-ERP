import { byIdParams } from './__param_builders.js';

export const WebOrdersEndpoints = {
    meta: { domains: ['web', 'web-user'] },

    byId: (orderId, { populate, fields } = {}) => ({
        path: `/web-orders/${orderId}`,
        params: byIdParams({ populate, fields }),
    }),
};