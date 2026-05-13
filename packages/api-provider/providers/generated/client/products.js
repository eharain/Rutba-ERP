import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { ProductsEndpoints as ProductsEndpointsApi } from '../../../api/products.js';

async function listAll(...args) {
    return executeEndpoint(authApi, 'listAll', ProductsEndpointsApi.listAll(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', ProductsEndpointsApi.list(...args));
}

async function search(...args) {
    return executeEndpoint(authApi, 'search', ProductsEndpointsApi.search(...args));
}

async function searchInRelation(...args) {
    return executeEndpoint(authApi, 'searchInRelation', ProductsEndpointsApi.searchInRelation(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', ProductsEndpointsApi.byId(...args));
}

async function save(...args) {
    return executeEndpoint(authApi, 'save', ProductsEndpointsApi.save(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', ProductsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', ProductsEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', ProductsEndpointsApi.del(...args));
}

async function loadProduct(...args) {
    return executeEndpoint(authApi, 'loadProduct', ProductsEndpointsApi.loadProduct(...args));
}

async function byParent(...args) {
    return executeEndpoint(authApi, 'byParent', ProductsEndpointsApi.byParent(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', ProductsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', ProductsEndpointsApi.byIdPublished(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', ProductsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', ProductsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', ProductsEndpointsApi.unpublish(...args));
}

async function fetchListAll(...args) {
    return listAll(...args);
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchSearch(...args) {
    return search(...args);
}

async function fetchSearchInRelation(...args) {
    return searchInRelation(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

async function fetchByParent(...args) {
    return byParent(...args);
}

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

const endpoints = {
    listAll,
    list,
    search,
    searchInRelation,
    byId,
    save,
    create,
    update,
    del,
    loadProduct,
    byParent,
    byIdDraft,
    byIdPublished,
    updateDraft,
    publish,
    unpublish,
    fetchListAll,
    fetchList,
    fetchSearch,
    fetchSearchInRelation,
    fetchById,
    postCreate,
    putUpdate,
    fetchByParent,
    fetchByIdDraft,
    fetchByIdPublished,
    meta: ProductsEndpointsApi.meta,
};

export default endpoints;
export const ProductsEndpoints = endpoints;
