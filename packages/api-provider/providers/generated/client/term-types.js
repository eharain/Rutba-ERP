import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchListVariants(...args) {
    return listVariants(...args);
}

async function fetchListWithTerms(...args) {
    return listWithTerms(...args);
}

async function fetchList(...args) {
    return list(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    listVariants,
    listWithTerms,
    list,
    create,
    update,
    del,
    fetchListVariants,
    fetchListWithTerms,
    fetchList,
    postCreate,
    putUpdate,
    meta: TermTypesEndpointsApi.meta,
};

export default endpoints;
export const TermTypesEndpoints = endpoints;
