import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { AccInvoicesEndpoints as AccInvoicesEndpointsApi } from '../../../api/acc-invoices.js';

async function list(arg1 = {}) {
    const ep = AccInvoicesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'AccInvoicesEndpoints',
    {
        list,
        meta: AccInvoicesEndpointsApi.meta,
    },
    ["list","meta"],
);

export default endpoints;
export const AccInvoicesEndpoints = endpoints;
