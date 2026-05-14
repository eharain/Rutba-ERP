import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { PayPayrollRunsEndpoints as PayPayrollRunsEndpointsApi } from '../../../api/pay-payroll-runs.js';

async function list(arg1 = {}) {
    const ep = PayPayrollRunsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'PayPayrollRunsEndpoints',
    {
        list,
        meta: PayPayrollRunsEndpointsApi.meta,
    },
    ["list","meta"],
);

export default endpoints;
export const PayPayrollRunsEndpoints = endpoints;
