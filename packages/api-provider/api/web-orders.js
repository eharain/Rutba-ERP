import { byIdParams } from './__param_builders.js';

export const WebOrdersEndpoints = {
    byId: (orderId, { populate, fields } = {}) => ({
        path: `/web-orders/${orderId}`,
        params: byIdParams({ populate, fields }),
    }),
};