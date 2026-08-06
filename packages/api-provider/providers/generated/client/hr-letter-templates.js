import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrLetterTemplatesEndpoints as HrLetterTemplatesEndpointsApi } from '../../../api/hr-letter-templates.js';

async function list(arg1 = {}) {
    const ep = HrLetterTemplatesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrLetterTemplatesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrLetterTemplatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrLetterTemplatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrLetterTemplatesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrLetterTemplatesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrLetterTemplatesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrLetterTemplatesEndpoints = endpoints;
