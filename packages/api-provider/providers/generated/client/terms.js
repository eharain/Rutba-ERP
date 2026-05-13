import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { TermsEndpoints as TermsEndpointsApi } from '../../../api/terms.js';

async function list(arg1 = {}) {
    const ep = TermsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = TermsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(id, data) {
    const ep = TermsEndpointsApi.update(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(id) {
    const ep = TermsEndpointsApi.del(id);
    return authApi.del(withQuery(ep.path, ep.params));
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
