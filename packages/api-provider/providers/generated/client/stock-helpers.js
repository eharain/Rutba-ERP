import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { StockHelpersEndpoints as StockHelpersEndpointsApi } from '../../../api/stock-helpers.js';

async function getStockStatus() {
    const ep = StockHelpersEndpointsApi.getStockStatus();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function relationConnects(relations) {
    const ep = StockHelpersEndpointsApi.relationConnects(relations);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'StockHelpersEndpoints',
    {
        getStockStatus,
        relationConnects,
        meta: StockHelpersEndpointsApi.meta,
    },
    ["getStockStatus","relationConnects","meta"],
);

export default endpoints;
export const StockHelpersEndpoints = endpoints;
