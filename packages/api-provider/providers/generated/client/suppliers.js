import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SuppliersEndpoints as SuppliersEndpointsApi } from '../../../api/suppliers.js';

async function updateDraft(documentId, data) {
    const ep = SuppliersEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = SuppliersEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = SuppliersEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = SuppliersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SuppliersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function listPaged(page = 1, pageSize = 100, arg3 = {}) {
    const ep = SuppliersEndpointsApi.listPaged(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function listAll(arg1 = {}) {
    const ep = SuppliersEndpointsApi.listAll(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = SuppliersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = SuppliersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'SuppliersEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        listPaged,
        listAll,
        list,
        update,
        meta: SuppliersEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","listPaged","listAll","list","update","meta"],
);

export default endpoints;
export const SuppliersEndpoints = endpoints;
