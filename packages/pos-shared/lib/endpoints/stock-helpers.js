import { getStockStatus, relationConnects } from '../api.js';

export const StockHelpersEndpoints = {
    getStockStatus: () => getStockStatus(),
    relationConnects: (relations) => relationConnects(relations),
};
