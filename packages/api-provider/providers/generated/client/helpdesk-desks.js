import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HelpdeskDesksEndpoints as HelpdeskDesksEndpointsApi } from '../../../api/helpdesk-desks.js';

async function list(arg1 = {}) {
    const ep = HelpdeskDesksEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(idOrKey) {
    const ep = HelpdeskDesksEndpointsApi.byId(idOrKey);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HelpdeskDesksEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(idOrKey, data) {
    const ep = HelpdeskDesksEndpointsApi.update(idOrKey, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function runDeactivate(idOrKey, data) {
    const ep = HelpdeskDesksEndpointsApi.runDeactivate(idOrKey, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function runActivate(idOrKey) {
    const ep = HelpdeskDesksEndpointsApi.runActivate(idOrKey);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HelpdeskDesksEndpoints',
    {
        list,
        byId,
        create,
        update,
        runDeactivate,
        runActivate,
        meta: HelpdeskDesksEndpointsApi.meta,
    },
    ["list","byId","create","update","runDeactivate","runActivate","meta"],
);

export default endpoints;
export const HelpdeskDesksEndpoints = endpoints;
