import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { PayPayslipsEndpoints as PayPayslipsEndpointsApi } from '../../../api/pay-payslips.js';

async function list(arg1 = {}) {
    const ep = PayPayslipsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
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
