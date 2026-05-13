import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { HrAttendancesEndpoints as HrAttendancesEndpointsApi } from '../../../api/hr-attendances.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrAttendancesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'HrAttendancesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const HrAttendancesEndpoints = endpoints;
