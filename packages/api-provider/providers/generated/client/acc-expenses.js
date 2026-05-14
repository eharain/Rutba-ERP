import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { AccExpensesEndpoints as AccExpensesEndpointsApi } from '../../../api/acc-expenses.js';

async function list(arg1 = {}) {
    const ep = AccExpensesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'AccExpensesEndpoints',
    {
        list,
        meta: AccExpensesEndpointsApi.meta,
    },
    ["list","meta"],
);

export default endpoints;
export const AccExpensesEndpoints = endpoints;
