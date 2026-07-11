import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SeedEndpoints as SeedEndpointsApi } from '../../../api/seed.js';

async function runSeed(data) {
    const ep = SeedEndpointsApi.runSeed(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function getStatus(arg1 = {}) {
    const ep = SeedEndpointsApi.getStatus(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listRuns(arg1 = {}) {
    const ep = SeedEndpointsApi.listRuns(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'SeedEndpoints',
    {
        runSeed,
        getStatus,
        listRuns,
        meta: SeedEndpointsApi.meta,
    },
    ["runSeed","getStatus","listRuns","meta"],
);

export default endpoints;
export const SeedEndpoints = endpoints;
