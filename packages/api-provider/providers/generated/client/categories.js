import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CategoriesEndpoints as CategoriesEndpointsApi } from '../../../api/categories.js';

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', CategoriesEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', CategoriesEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', CategoriesEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CategoriesEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', CategoriesEndpointsApi.del(...args));
}

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

async function update(...args) {
    return executeEndpoint(authApi, 'update', CategoriesEndpointsApi.update(...args));
}

async function searchCategories(...args) {
    return executeEndpoint(authApi, 'searchCategories', CategoriesEndpointsApi.searchCategories(...args));
}

const endpoints = strictEndpointGuard(
    'CategoriesEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        listPaged,
        listAll,
        list,
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        update,
        searchCategories,
        meta: CategoriesEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","listPaged","listAll","list","listDraft","listPublished","byIdDraft","byIdPublished","update","searchCategories","meta"],
);

export default endpoints;
export const CategoriesEndpoints = endpoints;
