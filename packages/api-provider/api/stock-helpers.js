import { getStockStatus, relationConnects } from '../lib/api.js';

export const StockHelpersEndpoints = {
    getStockStatus: () => getStockStatus(),
    relationConnects: (relations) => relationConnects(relations),
};