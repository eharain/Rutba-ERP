import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { MarketplaceSyncLogsEndpoints as MarketplaceSyncLogsEndpointsApi } from '../../../api/marketplace-sync-logs.js';

async function list(arg1 = {}) {
    const ep = MarketplaceSyncLogsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = MarketplaceSyncLogsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MarketplaceSyncLogsEndpoints',
    {
        list,
        byId,
        meta: MarketplaceSyncLogsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const MarketplaceSyncLogsEndpoints = endpoints;
