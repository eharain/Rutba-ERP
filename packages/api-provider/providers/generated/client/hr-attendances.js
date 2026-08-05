import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrAttendancesEndpoints as HrAttendancesEndpointsApi } from '../../../api/hr-attendances.js';

async function list(arg1 = {}) {
    const ep = HrAttendancesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listMyAttendance() {
    const ep = HrAttendancesEndpointsApi.listMyAttendance();
    return authApi.fetch(ep.path, ep.params);
}

async function listTeamAttendance() {
    const ep = HrAttendancesEndpointsApi.listTeamAttendance();
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrAttendancesEndpoints',
    {
        list,
        listMyAttendance,
        listTeamAttendance,
        meta: HrAttendancesEndpointsApi.meta,
    },
    ["list","listMyAttendance","listTeamAttendance","meta"],
);

export default endpoints;
export const HrAttendancesEndpoints = endpoints;
