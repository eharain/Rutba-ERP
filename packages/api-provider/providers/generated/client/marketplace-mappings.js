import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MarketplaceMappingsEndpoints as MarketplaceMappingsEndpointsApi } from '../../../api/marketplace-mappings.js';

async function list(arg1 = {}) {
    const ep = MarketplaceMappingsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = MarketplaceMappingsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MarketplaceMappingsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MarketplaceMappingsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MarketplaceMappingsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MarketplaceMappingsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MarketplaceMappingsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MarketplaceMappingsEndpoints = endpoints;
