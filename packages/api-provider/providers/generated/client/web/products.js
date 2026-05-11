import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebProductsEndpoints as WebProductsEndpointsApi } from '../../../../api/web/products.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebProductsEndpointsApi.list(...args));
}

async function detail(...args) {
    return executeEndpoint(authApi, 'detail', WebProductsEndpointsApi.detail(...args));
}

async function featured(...args) {
    return executeEndpoint(authApi, 'featured', WebProductsEndpointsApi.featured(...args));
}

async function search(...args) {
    return executeEndpoint(authApi, 'search', WebProductsEndpointsApi.search(...args));
}

async function byIds(...args) {
    return executeEndpoint(authApi, 'byIds', WebProductsEndpointsApi.byIds(...args));
}

async function highestPrice(...args) {
    return executeEndpoint(authApi, 'highestPrice', WebProductsEndpointsApi.highestPrice(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchSearch(...args) {
    return search(...args);
}

async function fetchByIds(...args) {
    return byIds(...args);
}

const endpoints = {
    list,
    detail,
    featured,
    search,
    byIds,
    highestPrice,
    fetchList,
    fetchSearch,
    fetchByIds,
};

export default endpoints;
export const WebProductsEndpoints = endpoints;
