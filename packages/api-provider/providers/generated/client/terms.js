import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { TermsEndpoints as TermsEndpointsApi } from '../../../api/terms.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', TermsEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', TermsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', TermsEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', TermsEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'TermsEndpoints',
    {
        list,
        create,
        update,
        del,
        meta: TermsEndpointsApi.meta,
    },
    ["list","create","update","del","meta"],
);

export default endpoints;
export const TermsEndpoints = endpoints;
