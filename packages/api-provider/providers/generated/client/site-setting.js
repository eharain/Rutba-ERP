import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SiteSettingEndpoints as SiteSettingEndpointsApi } from '../../../api/site-setting.js';

async function getDraft(...args) {
    return executeEndpoint(authApi, 'getDraft', SiteSettingEndpointsApi.getDraft(...args));
}

async function fetchDraft(...args) {
    return executeEndpoint(authApi, 'fetchDraft', SiteSettingEndpointsApi.fetchDraft(...args));
}

async function getPublished(...args) {
    return executeEndpoint(authApi, 'getPublished', SiteSettingEndpointsApi.getPublished(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', SiteSettingEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SiteSettingEndpointsApi.publish(...args));
}

async function discard(...args) {
    return executeEndpoint(authApi, 'discard', SiteSettingEndpointsApi.discard(...args));
}

async function fetchGetDraft(...args) {
    return getDraft(...args);
}

async function fetchGetPublished(...args) {
    return getPublished(...args);
}

const endpoints = {
    getDraft,
    fetchDraft,
    getPublished,
    updateDraft,
    publish,
    discard,
    fetchGetDraft,
    fetchGetPublished,
};

export default endpoints;
export const SiteSettingEndpoints = endpoints;
