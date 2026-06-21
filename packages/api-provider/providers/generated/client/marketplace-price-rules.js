import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MarketplacePriceRulesEndpoints as MarketplacePriceRulesEndpointsApi } from '../../../api/marketplace-price-rules.js';

async function list(arg1 = {}) {
    const ep = MarketplacePriceRulesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = MarketplacePriceRulesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MarketplacePriceRulesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MarketplacePriceRulesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MarketplacePriceRulesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MarketplacePriceRulesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MarketplacePriceRulesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MarketplacePriceRulesEndpoints = endpoints;
