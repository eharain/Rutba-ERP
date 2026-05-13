import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { TermTypesEndpoints as TermTypesEndpointsApi } from '../../../api/term-types.js';

async function listVariants(...args) {
    return executeEndpoint(authApi, 'listVariants', TermTypesEndpointsApi.listVariants(...args));
}

async function listWithTerms(...args) {
    return executeEndpoint(authApi, 'listWithTerms', TermTypesEndpointsApi.listWithTerms(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', TermTypesEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', TermTypesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', TermTypesEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', TermTypesEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'TermTypesEndpoints',
    {
        listVariants,
        listWithTerms,
        list,
        create,
        update,
        del,
        meta: TermTypesEndpointsApi.meta,
    },
    ["listVariants","listWithTerms","list","create","update","del","meta"],
);

export default endpoints;
export const TermTypesEndpoints = endpoints;
