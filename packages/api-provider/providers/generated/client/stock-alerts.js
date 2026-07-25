import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockAlertsEndpoints as StockAlertsEndpointsApi } from '../../../api/stock-alerts.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = StockAlertsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = StockAlertsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function acknowledge(documentId) {
    const ep = StockAlertsEndpointsApi.acknowledge(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function dismiss(documentId, notes) {
    const ep = StockAlertsEndpointsApi.dismiss(documentId, notes);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runNow() {
    const ep = StockAlertsEndpointsApi.runNow();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockAlertsEndpoints',
    {
        list,
        byId,
        acknowledge,
        dismiss,
        runNow,
        meta: StockAlertsEndpointsApi.meta,
    },
    ["list","byId","acknowledge","dismiss","runNow","meta"],
);

export default endpoints;
export const StockAlertsEndpoints = endpoints;
