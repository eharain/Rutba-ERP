import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AccInvoicesEndpoints as AccInvoicesEndpointsApi } from '../../../api/acc-invoices.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccInvoicesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const AccInvoicesEndpoints = endpoints;
