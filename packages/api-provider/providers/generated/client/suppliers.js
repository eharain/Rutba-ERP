import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SuppliersEndpoints as SuppliersEndpointsApi } from '../../../api/suppliers.js';

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

async function fetchListPaged(...args) {
    return listPaged(...args);
}

async function fetchListAll(...args) {
    return listAll(...args);
}

async function fetchList(...args) {
    return list(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    listPaged,
    listAll,
    list,
    update,
    fetchListPaged,
    fetchListAll,
    fetchList,
    putUpdate,
    meta: SuppliersEndpointsApi.meta,
};

export default endpoints;
export const SuppliersEndpoints = endpoints;
