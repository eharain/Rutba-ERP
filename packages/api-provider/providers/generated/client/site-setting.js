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

async function updateDraft(data) {
    const ep = SiteSettingEndpointsApi.updateDraft(data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(data) {
    const ep = SiteSettingEndpointsApi.publish(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function discard(data) {
    const ep = SiteSettingEndpointsApi.discard(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'SiteSettingEndpoints',
    {
        getDraft,
        fetchDraft,
        getPublished,
        updateDraft,
        publish,
        discard,
        meta: SiteSettingEndpointsApi.meta,
    },
    ["getDraft","fetchDraft","getPublished","updateDraft","publish","discard","meta"],
);

export default endpoints;
export const SiteSettingEndpoints = endpoints;
