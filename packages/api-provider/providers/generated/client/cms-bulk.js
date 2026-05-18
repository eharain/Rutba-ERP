import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CmsBulkEndpoints as CmsBulkEndpointsApi } from '../../../api/cms-bulk.js';

async function runImport(contentType, items) {
    const ep = CmsBulkEndpointsApi.runImport(contentType, items);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'CmsBulkEndpoints',
    {
        runImport,
        meta: CmsBulkEndpointsApi.meta,
    },
    ["runImport","meta"],
);

export default endpoints;
export const CmsBulkEndpoints = endpoints;
