import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { ContentSyncEndpoints as ContentSyncEndpointsApi } from '../../../api/content-sync.js';

async function getSyncConfig() {
    const ep = ContentSyncEndpointsApi.getSyncConfig();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function syncRun(data) {
    const ep = ContentSyncEndpointsApi.syncRun(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function getSyncStatus(jobId) {
    const ep = ContentSyncEndpointsApi.getSyncStatus(jobId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function syncCancel(jobId) {
    const ep = ContentSyncEndpointsApi.syncCancel(jobId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'ContentSyncEndpoints',
    {
        getSyncConfig,
        syncRun,
        getSyncStatus,
        syncCancel,
        meta: ContentSyncEndpointsApi.meta,
    },
    ["getSyncConfig","syncRun","getSyncStatus","syncCancel","meta"],
);

export default endpoints;
export const ContentSyncEndpoints = endpoints;
