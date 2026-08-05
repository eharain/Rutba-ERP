import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SiteSettingEndpoints as SiteSettingEndpointsApi } from '../../../api/site-setting.js';

async function getDraft(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.getDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function fetchDraft(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.fetchDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getPublished(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.getPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function publishResolved(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.publishResolved(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublishResolved(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.unpublishResolved(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function discardResolved(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.discardResolved(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = SiteSettingEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function findOne(documentId, arg2 = {}) {
    const ep = SiteSettingEndpointsApi.findOne(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function updateDraft(documentId, data) {
    const ep = SiteSettingEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = SiteSettingEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = SiteSettingEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = SiteSettingEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SiteSettingEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'SiteSettingEndpoints',
    {
        getDraft,
        fetchDraft,
        getPublished,
        publishResolved,
        unpublishResolved,
        discardResolved,
        list,
        findOne,
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        meta: SiteSettingEndpointsApi.meta,
    },
    ["getDraft","fetchDraft","getPublished","publishResolved","unpublishResolved","discardResolved","list","findOne","updateDraft","publish","unpublish","create","del","meta"],
);

export default endpoints;
export const SiteSettingEndpoints = endpoints;
