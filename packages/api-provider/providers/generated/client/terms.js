import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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
    list,
    create,
    update,
    del,
    fetchList,
    postCreate,
    putUpdate,
    meta: TermsEndpointsApi.meta,
};

export default endpoints;
export const TermsEndpoints = endpoints;
