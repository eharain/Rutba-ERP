import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CategoriesEndpoints as CategoriesEndpointsApi } from '../../../api/categories.js';

async function listPaged(...args) {
    return executeEndpoint(authApi, 'listPaged', CategoriesEndpointsApi.listPaged(...args));
}

async function listAll(...args) {
    return executeEndpoint(authApi, 'listAll', CategoriesEndpointsApi.listAll(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', CategoriesEndpointsApi.list(...args));
}

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', CategoriesEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', CategoriesEndpointsApi.listPublished(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', CategoriesEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', CategoriesEndpointsApi.byIdPublished(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', CategoriesEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', CategoriesEndpointsApi.unpublish(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', CategoriesEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', CategoriesEndpointsApi.del(...args));
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

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    listPaged,
    listAll,
    list,
    listDraft,
    listPublished,
    byIdDraft,
    byIdPublished,
    publish,
    unpublish,
    update,
    del,
    fetchListPaged,
    fetchListAll,
    fetchList,
    fetchListDraft,
    fetchListPublished,
    fetchByIdDraft,
    fetchByIdPublished,
    putUpdate,
    meta: CategoriesEndpointsApi.meta,
};

export default endpoints;
export const CategoriesEndpoints = endpoints;
