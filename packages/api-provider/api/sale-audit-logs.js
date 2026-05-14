/**
 * SaleAuditLogsEndpoints
 *
 * Append-only trail of teller actions on a sale. Write access (`create`)
 * goes to admin/manager/staff so the live sale page can record its own
 * actions. Read access (`find`/`findOne`) is admin/manager only — staff
 * make audit entries but can't read them back.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const SaleAuditLogsEndpoints = {
    meta: {
        uid: 'api::sale-audit-log.sale-audit-log',
        domains: ['sale'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** List audit entries, newest first by default. Admin/manager only. */
    list: ({ page = 1, pageSize = 100, sort, filters, populate, fields } = {}) => ({
        path: '/sale-audit-logs',
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['performed_at:desc'], pageSize: 200 },
        ),
    }),

    /** Fetch a single audit entry. Admin/manager only. */
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/sale-audit-logs/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),

    /** Create a new audit entry. Open to staff so they record their own
     *  actions while transacting. */
    create: (data) => ({
        path: '/sale-audit-logs',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Find all entries for one sale (most useful read pattern — the
     *  admin "Audit" tab on a sale page uses this). */
    bySale: (saleDocId, { sort, populate, fields } = {}) => ({
        path: '/sale-audit-logs',
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager'],
        params: listParams(
            { sort, populate, fields, filters: { sale: { documentId: { $eq: saleDocId } } }, pageSize: 500 },
            { sort: ['performed_at:asc'] },
        ),
    }),
};
