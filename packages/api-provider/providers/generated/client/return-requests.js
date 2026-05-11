import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { ReturnRequestsEndpoints as ReturnRequestsEndpointsApi } from '../../../api/return-requests.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', ReturnRequestsEndpointsApi.create(...args));
}

async function postCreate(...args) {
    return create(...args);
}

const endpoints = {
    create,
    postCreate,
};

export default endpoints;
export const ReturnRequestsEndpoints = endpoints;
