import { getStockStatus, relationConnects } from '../lib/api.js';

export const StockHelpersEndpoints = {
    meta: { domains: ['stock'] },

    getStockStatus: () => getStockStatus(),
    relationConnects: (relations) => relationConnects(relations),
};