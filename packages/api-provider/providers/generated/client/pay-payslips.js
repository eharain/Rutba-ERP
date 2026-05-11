import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PayPayslipsEndpoints as PayPayslipsEndpointsApi } from '../../../api/pay-payslips.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PayPayslipsEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const PayPayslipsEndpoints = endpoints;
