import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchListDraft(...args) {
    return listDraft(...args);
}

async function fetchListPublished(...args) {
    return listPublished(...args);
}

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

async function postCreate(...args) {
    return create(...args);
}

const endpoints = {
    listDraft,
    listPublished,
    byIdDraft,
    byIdPublished,
    create,
    updateDraft,
    publish,
    unpublish,
    del,
    fetchListDraft,
    fetchListPublished,
    fetchByIdDraft,
    fetchByIdPublished,
    postCreate,
    meta: ProductGroupsEndpointsApi.meta,
};

export default endpoints;
export const ProductGroupsEndpoints = endpoints;
