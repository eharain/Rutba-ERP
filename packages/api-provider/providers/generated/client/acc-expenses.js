import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { AccExpensesEndpoints as AccExpensesEndpointsApi } from '../../../api/acc-expenses.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccExpensesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'AccExpensesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const AccExpensesEndpoints = endpoints;
