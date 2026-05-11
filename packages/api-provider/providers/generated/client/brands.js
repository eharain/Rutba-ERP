import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { BrandsEndpoints as BrandsEndpointsApi } from '../../../api/brands.js';

async function listPaged(...args) {
    return executeEndpoint(authApi, 'listPaged', BrandsEndpointsApi.listPaged(...args));
}

async function listAll(...args) {
    return executeEndpoint(authApi, 'listAll', BrandsEndpointsApi.listAll(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', BrandsEndpointsApi.list(...args));
}

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', BrandsEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', BrandsEndpointsApi.listPublished(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', BrandsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', BrandsEndpointsApi.update(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', BrandsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', BrandsEndpointsApi.byIdPublished(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', BrandsEndpointsApi.updateDraft(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', BrandsEndpointsApi.del(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', BrandsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', BrandsEndpointsApi.unpublish(...args));
}

async function fetchListPaged(...args) {
    return listPaged(...args);
}

async function fetchListAll(...args) {
    return listAll(...args);
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchListDraft(...args) {
    return listDraft(...args);
}

async function fetchListPublished(...args) {
    return listPublished(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

const endpoints = {
    listPaged,
    listAll,
    list,
    listDraft,
    listPublished,
    create,
    update,
    byIdDraft,
    byIdPublished,
    updateDraft,
    del,
    publish,
    unpublish,
    fetchListPaged,
    fetchListAll,
    fetchList,
    fetchListDraft,
    fetchListPublished,
    postCreate,
    putUpdate,
    fetchByIdDraft,
    fetchByIdPublished,
    meta: BrandsEndpointsApi.meta,
};

export default endpoints;
export const BrandsEndpoints = endpoints;
