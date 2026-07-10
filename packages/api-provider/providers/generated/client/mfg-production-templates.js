import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgProductionTemplatesEndpoints as MfgProductionTemplatesEndpointsApi } from '../../../api/mfg-production-templates.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgProductionTemplatesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgProductionTemplatesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgProductionTemplatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgProductionTemplatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgProductionTemplatesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function instantiate(documentId, opts = {}) {
    const ep = MfgProductionTemplatesEndpointsApi.instantiate(documentId, opts);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'MfgProductionTemplatesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        instantiate,
        meta: MfgProductionTemplatesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","instantiate","meta"],
);

export default endpoints;
export const MfgProductionTemplatesEndpoints = endpoints;
