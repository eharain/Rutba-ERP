import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CrmActivitiesEndpoints as CrmActivitiesEndpointsApi } from '../../../api/crm-activities.js';

async function list(arg1 = {}) {
    const ep = CrmActivitiesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CrmActivitiesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CrmActivitiesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = CrmActivitiesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CrmActivitiesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function getTimeline(arg1 = {}) {
    const ep = CrmActivitiesEndpointsApi.getTimeline(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listFollowups(arg1 = {}) {
    const ep = CrmActivitiesEndpointsApi.listFollowups(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function markFollowupDone(documentId, data = { done: true }) {
    const ep = CrmActivitiesEndpointsApi.markFollowupDone(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CrmActivitiesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        getTimeline,
        listFollowups,
        markFollowupDone,
        meta: CrmActivitiesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","getTimeline","listFollowups","markFollowupDone","meta"],
);

export default endpoints;
export const CrmActivitiesEndpoints = endpoints;
