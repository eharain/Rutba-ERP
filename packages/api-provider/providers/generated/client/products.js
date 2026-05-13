import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { ProductsEndpoints as ProductsEndpointsApi } from '../../../api/products.js';

async function listPaged(...args) {
    return executeEndpoint(authApi, 'listPaged', ProductsEndpointsApi.listPaged(...args));
}

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

async function searchByTerm(...args) {
    return executeEndpoint(authApi, 'searchByTerm', ProductsEndpointsApi.searchByTerm(...args));
}

async function loadProduct(...args) {
    return executeEndpoint(authApi, 'loadProduct', ProductsEndpointsApi.loadProduct(...args));
}

async function byParent(...args) {
    return executeEndpoint(authApi, 'byParent', ProductsEndpointsApi.byParent(...args));
}

async function byParentDraft(...args) {
    return executeEndpoint(authApi, 'byParentDraft', ProductsEndpointsApi.byParentDraft(...args));
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

const endpoints = strictEndpointGuard(
    'ProductsEndpoints',
    {
        listPaged,
        listAll,
        list,
        search,
        searchInRelation,
        byId,
        save,
        create,
        update,
        del,
        searchByTerm,
        loadProduct,
        byParent,
        byParentDraft,
        byIdDraft,
        byIdPublished,
        updateDraft,
        publish,
        unpublish,
        meta: ProductsEndpointsApi.meta,
    },
    ["listPaged","listAll","list","search","searchInRelation","byId","save","create","update","del","searchByTerm","loadProduct","byParent","byParentDraft","byIdDraft","byIdPublished","updateDraft","publish","unpublish","meta"],
);

export default endpoints;
export const ProductsEndpoints = endpoints;
