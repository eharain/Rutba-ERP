import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CustomersEndpoints as CustomersEndpointsApi } from '../../../api/customers.js';

async function findByContact(...args) {
    return executeEndpoint(authApi, 'findByContact', CustomersEndpointsApi.findByContact(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CustomersEndpointsApi.create(...args));
}

async function search(...args) {
    return executeEndpoint(authApi, 'search', CustomersEndpointsApi.search(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', CustomersEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'CustomersEndpoints',
    {
        findByContact,
        create,
        search,
        update,
        meta: CustomersEndpointsApi.meta,
    },
    ["findByContact","create","search","update","meta"],
);

export default endpoints;
export const CustomersEndpoints = endpoints;
