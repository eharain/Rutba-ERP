import { webApi } from '../../../../lib/api.js';
import { epCtx, strictEndpointGuard } from '../___core__.js';
import { WebProductsEndpoints as WebProductsEndpointsApi } from '../../../../api/web/products.js';

async function list(filter = {}, page = '1') {
    const ep = WebProductsEndpointsApi.list(filter, page);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function detail(slug, groupId) {
    const ep = WebProductsEndpointsApi.detail(slug, groupId);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function share(slug) {
    const ep = WebProductsEndpointsApi.share(slug);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function featured() {
    const ep = WebProductsEndpointsApi.featured();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function search(search, pageSize = 5) {
    const ep = WebProductsEndpointsApi.search(search, pageSize);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIds(idProducts = []) {
    const ep = WebProductsEndpointsApi.byIds(idProducts);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function highestPrice() {
    const ep = WebProductsEndpointsApi.highestPrice();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'WebProductsEndpoints',
    {
        list,
        detail,
        share,
        featured,
        search,
        byIds,
        highestPrice,
    },
    ["list","detail","share","featured","search","byIds","highestPrice"],
);

export default endpoints;
export const WebProductsEndpoints = endpoints;
