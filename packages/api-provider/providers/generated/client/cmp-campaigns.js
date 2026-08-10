import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CmpCampaignsEndpoints as CmpCampaignsEndpointsApi } from '../../../api/cmp-campaigns.js';

async function list(arg1 = {}) {
    const ep = CmpCampaignsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpCampaignsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = CmpCampaignsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = CmpCampaignsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CmpCampaignsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function runCampaign(documentId) {
    const ep = CmpCampaignsEndpointsApi.runCampaign(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancelCampaign(documentId) {
    const ep = CmpCampaignsEndpointsApi.cancelCampaign(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'CmpCampaignsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        runCampaign,
        cancelCampaign,
        meta: CmpCampaignsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","runCampaign","cancelCampaign","meta"],
);

export default endpoints;
export const CmpCampaignsEndpoints = endpoints;
