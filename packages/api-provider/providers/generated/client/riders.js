import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { RidersEndpoints as RidersEndpointsApi } from '../../../api/riders.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', RidersEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', RidersEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', RidersEndpointsApi.update(...args));
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
    fetchList,
    postCreate,
    putUpdate,
    meta: RidersEndpointsApi.meta,
};

export default endpoints;
export const RidersEndpoints = endpoints;
