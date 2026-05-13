import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { TermTypesEndpoints as TermTypesEndpointsApi } from '../../../api/term-types.js';

async function listVariants(arg1 = {}) {
    const ep = TermTypesEndpointsApi.listVariants(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listWithTerms(arg1 = {}) {
    const ep = TermTypesEndpointsApi.listWithTerms(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = TermTypesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = TermTypesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(id, data) {
    const ep = TermTypesEndpointsApi.update(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(id) {
    const ep = TermTypesEndpointsApi.del(id);
    return authApi.del(withQuery(ep.path, ep.params));
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
