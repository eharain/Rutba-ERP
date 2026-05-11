import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebProductGroupsEndpoints as WebProductGroupsEndpointsApi } from '../../../../api/web/product-groups.js';

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', WebProductGroupsEndpointsApi.bySlug(...args));
}

async function fetchBySlug(...args) {
    return bySlug(...args);
}

const endpoints = {
    bySlug,
    fetchBySlug,
};

export default endpoints;
export const WebProductGroupsEndpoints = endpoints;
