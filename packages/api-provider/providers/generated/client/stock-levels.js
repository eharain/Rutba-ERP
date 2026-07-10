import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockLevelsEndpoints as StockLevelsEndpointsApi } from '../../../api/stock-levels.js';

async function list(page = 1, pageSize = 100, arg3 = {}) {
    const ep = StockLevelsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byProduct(productDocId, arg2 = {}) {
    const ep = StockLevelsEndpointsApi.byProduct(productDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function recompute() {
    const ep = StockLevelsEndpointsApi.recompute();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockLevelsEndpoints',
    {
        list,
        byProduct,
        recompute,
        meta: StockLevelsEndpointsApi.meta,
    },
    ["list","byProduct","recompute","meta"],
);

export default endpoints;
export const StockLevelsEndpoints = endpoints;
