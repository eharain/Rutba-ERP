import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SuppliersEndpoints as SuppliersEndpointsApi } from '../../../api/suppliers.js';

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', SuppliersEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SuppliersEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', SuppliersEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SuppliersEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', SuppliersEndpointsApi.del(...args));
}

async function listPaged(...args) {
    return executeEndpoint(authApi, 'listPaged', SuppliersEndpointsApi.listPaged(...args));
}

async function listAll(...args) {
    return executeEndpoint(authApi, 'listAll', SuppliersEndpointsApi.listAll(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', SuppliersEndpointsApi.list(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SuppliersEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'SuppliersEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        listPaged,
        listAll,
        list,
        update,
        meta: SuppliersEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","listPaged","listAll","list","update","meta"],
);

export default endpoints;
export const SuppliersEndpoints = endpoints;
