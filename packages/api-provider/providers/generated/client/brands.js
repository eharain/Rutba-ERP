import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
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

const endpoints = strictEndpointGuard(
    'BrandsEndpoints',
    {
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
        meta: BrandsEndpointsApi.meta,
    },
    ["listPaged","listAll","list","listDraft","listPublished","create","update","byIdDraft","byIdPublished","updateDraft","del","publish","unpublish","meta"],
);

export default endpoints;
export const BrandsEndpoints = endpoints;
