import { listParams, byIdParams } from './__param_builders.js';

/**
 * Secondary (matrix / dotted-line) reporting relationships.
 *
 * The primary line lives on `hr-employee.reports_to` and is edited through
 * `HrEmployeesEndpoints.setReportingLine`. These rows are the additional lines
 * a single manyToOne cannot express.
 *
 * HR admin/manager ONLY, reads included — deliberately, and not just because
 * writes here change who may approve another person's leave.
 *
 * rutba-core serves seeded CRUD rows through a GENERIC handler
 * (`coreHandler(uid, action)` in rutba-core/src/http/server.js), not through the
 * pos-strapi controller, so a controller-side `find` override that narrowed the
 * result set per caller would simply not run there — the same call that returns
 * "your own lines" on :4010 would return the whole org's on :4020. Rather than
 * depend on an override that only half the stack executes, the api-pro policy
 * is the gate, and it is the same on both.
 *
 * ESS is not cut off by this: the org chart already embeds each node's
 * `secondary_managers`, scoped server-side, so "Where I Sit" shows a person
 * their own dotted lines without reading this collection at all.
 */
export const HrReportingLinesEndpoints = {
    meta: {
        uid: 'api::hr-reporting-line.hr-reporting-line',
        domains: ['hr'],
        roles: ['admin', 'manager'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-reporting-lines',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee', 'manager'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-reporting-lines/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-reporting-lines',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-reporting-lines/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-reporting-lines/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin', 'manager'],
    }),
};
