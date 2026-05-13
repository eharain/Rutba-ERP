import { authApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebProductsEndpoints as WebProductsEndpointsApi } from '../../../../api/web/products.js';

async function list(filter = {}, page = '1') {
    const ep = WebProductsEndpointsApi.list(filter, page);
    return authApi.fetch(ep.path, ep.params);
}

async function detail(slug) {
    const ep = WebProductsEndpointsApi.detail(slug);
    return authApi.fetch(ep.path, ep.params);
}

async function featured() {
    const ep = WebProductsEndpointsApi.featured();
    return authApi.fetch(ep.path, ep.params);
}

async function search(search, pageSize = 5) {
    const ep = WebProductsEndpointsApi.search(search, pageSize);
    return authApi.fetch(ep.path, ep.params);
}

async function byIds(idProducts = []) {
    const ep = WebProductsEndpointsApi.byIds(idProducts);
    return authApi.fetch(ep.path, ep.params);
}

async function highestPrice() {
    const ep = WebProductsEndpointsApi.highestPrice();
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebProductsEndpoints',
    {
        list,
        detail,
        featured,
        search,
        byIds,
        highestPrice,
    },
    ["list","detail","featured","search","byIds","highestPrice"],
);

export default endpoints;
export const WebProductsEndpoints = endpoints;
