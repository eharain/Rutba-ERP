import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { HrAttendancesEndpoints as HrAttendancesEndpointsApi } from '../../../api/hr-attendances.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrAttendancesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const HrAttendancesEndpoints = endpoints;
