import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AccAccountsEndpoints as AccAccountsEndpointsApi } from '../../../api/acc-accounts.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccAccountsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', AccAccountsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', AccAccountsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', AccAccountsEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', AccAccountsEndpointsApi.del(...args));
}

async function fetchList(...args) {
    return list(...args);
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

const endpoints = {
    list,
    byId,
    create,
    update,
    del,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    meta: AccAccountsEndpointsApi.meta,
};

export default endpoints;
export const AccAccountsEndpoints = endpoints;
