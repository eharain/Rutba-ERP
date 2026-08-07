import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CmpSendingIdentitiesEndpoints as CmpSendingIdentitiesEndpointsApi } from '../../../api/cmp-sending-identities.js';

async function list(arg1 = {}) {
    const ep = CmpSendingIdentitiesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpSendingIdentitiesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = CmpSendingIdentitiesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = CmpSendingIdentitiesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CmpSendingIdentitiesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function setupSender(documentId, arg2 = {}) {
    const ep = CmpSendingIdentitiesEndpointsApi.setupSender(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function validateSender(documentId) {
    const ep = CmpSendingIdentitiesEndpointsApi.validateSender(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function resetToken(documentId) {
    const ep = CmpSendingIdentitiesEndpointsApi.resetToken(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function getMtaHealth() {
    const ep = CmpSendingIdentitiesEndpointsApi.getMtaHealth();
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'CmpSendingIdentitiesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        setupSender,
        validateSender,
        resetToken,
        getMtaHealth,
        meta: CmpSendingIdentitiesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","setupSender","validateSender","resetToken","getMtaHealth","meta"],
);

export default endpoints;
export const CmpSendingIdentitiesEndpoints = endpoints;
