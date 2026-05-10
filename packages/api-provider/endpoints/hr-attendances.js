import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { HrAttendancesEndpoints } from '@/api/hr-attendances.js';

export default createClientProxy(HrAttendancesEndpoints, authApi);
export const HrAttendancesEndpointsProxy = createClientProxy(HrAttendancesEndpoints, authApi);
