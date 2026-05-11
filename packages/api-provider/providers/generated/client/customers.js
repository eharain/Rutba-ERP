import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function postCreate(...args) {
    return create(...args);
}

async function fetchSearch(...args) {
    return search(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    findByContact,
    create,
    search,
    update,
    postCreate,
    fetchSearch,
    putUpdate,
    meta: CustomersEndpointsApi.meta,
};

export default endpoints;
export const CustomersEndpoints = endpoints;
