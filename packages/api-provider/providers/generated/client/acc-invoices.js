import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { AccInvoicesEndpoints as AccInvoicesEndpointsApi } from '../../../api/acc-invoices.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccInvoicesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'AccInvoicesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const AccInvoicesEndpoints = endpoints;
