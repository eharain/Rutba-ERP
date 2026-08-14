import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrHolidayCalendarsEndpoints as HrHolidayCalendarsEndpointsApi } from '../../../api/hr-holiday-calendars.js';

async function list(arg1 = {}) {
    const ep = HrHolidayCalendarsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrHolidayCalendarsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrHolidayCalendarsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrHolidayCalendarsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = HrHolidayCalendarsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrHolidayCalendarsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrHolidayCalendarsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrHolidayCalendarsEndpoints = endpoints;
