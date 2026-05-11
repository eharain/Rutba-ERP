import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebLeadsEndpoints as WebLeadsEndpointsApi } from '../../../../api/web/leads.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', WebLeadsEndpointsApi.create(...args));
}

async function postCreate(...args) {
    return create(...args);
}

const endpoints = {
    create,
    postCreate,
};

export default endpoints;
export const WebLeadsEndpoints = endpoints;
