import { listParams, byIdParams } from './__param_builders.js';

/** Holidays are read broadly (hr + ess: needed for "upcoming holidays" widgets); writes stay HR-only. */
export const HrHolidayCalendarsEndpoints = {
    meta: {
        uid: 'api::hr-holiday-calendar.hr-holiday-calendar',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-holiday-calendars',
        action: 'find',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-holiday-calendars/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-holiday-calendars',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-holiday-calendars/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-holiday-calendars/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin', 'manager'],
    }),
};
