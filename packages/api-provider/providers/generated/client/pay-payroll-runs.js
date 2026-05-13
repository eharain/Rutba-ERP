import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { PayPayrollRunsEndpoints as PayPayrollRunsEndpointsApi } from '../../../api/pay-payroll-runs.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PayPayrollRunsEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'PayPayrollRunsEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const PayPayrollRunsEndpoints = endpoints;
