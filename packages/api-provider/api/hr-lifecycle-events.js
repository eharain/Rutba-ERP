import { listParams, byIdParams } from './__param_builders.js';

/**
 * HrLifecycleEventsEndpoints — onboarding, confirmation, promotion, transfer,
 * salary revision, resignation, exit — one timeline per employee.
 *
 * listMine is employee self-service (own history, read-only). HR handles
 * logging/managing events via the standard find/byId/create/update/del set.
 */
export const HrLifecycleEventsEndpoints = {
    meta: {
        uid: 'api::hr-lifecycle-event.hr-lifecycle-event',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own lifecycle timeline (self-service). */
    listMine: () => ({
        path: '/hr-lifecycle-events/mine',
        action: 'myTimeline',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-lifecycle-events',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['effective_date:desc'], populate: ['employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-lifecycle-events/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-lifecycle-events',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-lifecycle-events/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-lifecycle-events/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin', 'manager'],
    }),
};
