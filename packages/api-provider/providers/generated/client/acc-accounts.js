import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
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

const endpoints = strictEndpointGuard(
    'AccAccountsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: AccAccountsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const AccAccountsEndpoints = endpoints;
