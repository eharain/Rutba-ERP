import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SaleAuditLogsEndpoints as SaleAuditLogsEndpointsApi } from '../../../api/sale-audit-logs.js';

async function list(arg1 = {}) {
    const ep = SaleAuditLogsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = SaleAuditLogsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SaleAuditLogsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function bySale(saleDocId, arg2 = {}) {
    const ep = SaleAuditLogsEndpointsApi.bySale(saleDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'SaleAuditLogsEndpoints',
    {
        list,
        byId,
        create,
        bySale,
        meta: SaleAuditLogsEndpointsApi.meta,
    },
    ["list","byId","create","bySale","meta"],
);

export default endpoints;
export const SaleAuditLogsEndpoints = endpoints;
