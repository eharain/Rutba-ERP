import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CustomersEndpoints as CustomersEndpointsApi } from '../../../api/customers.js';

async function findByContact(arg1 = {}) {
    const ep = CustomersEndpointsApi.findByContact(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CustomersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function search(q, pageSize = 10) {
    const ep = CustomersEndpointsApi.search(q, pageSize);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function update(documentId, data) {
    const ep = CustomersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
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
