import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { PayPayslipsEndpoints as PayPayslipsEndpointsApi } from '../../../api/pay-payslips.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PayPayslipsEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'PayPayslipsEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const PayPayslipsEndpoints = endpoints;
