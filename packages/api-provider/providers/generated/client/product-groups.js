import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { ProductGroupsEndpoints as ProductGroupsEndpointsApi } from '../../../api/product-groups.js';

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', ProductGroupsEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', ProductGroupsEndpointsApi.listPublished(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', ProductGroupsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', ProductGroupsEndpointsApi.byIdPublished(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', ProductGroupsEndpointsApi.create(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', ProductGroupsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', ProductGroupsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', ProductGroupsEndpointsApi.unpublish(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', ProductGroupsEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'ProductGroupsEndpoints',
    {
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        create,
        updateDraft,
        publish,
        unpublish,
        del,
        meta: ProductGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","create","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const ProductGroupsEndpoints = endpoints;
