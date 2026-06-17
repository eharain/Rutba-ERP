import { listParams, byIdParams } from './__param_builders.js';

/**
 * PayStatutoryRemittancesEndpoints — payments of withheld statutory liabilities
 * (tax / social security / pension) to the authority. `process` posts the GL
 * entry (Dr the liability account, Cr cash/bank) and marks the remittance Paid.
 * Payroll admin/manager only.
 */
export const PayStatutoryRemittancesEndpoints = {
    meta: {
        uid: 'api::pay-statutory-remittance.pay-statutory-remittance',
        domains: ['payroll'],
        roles: ['admin', 'manager'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-statutory-remittances',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['branch'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-statutory-remittances/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }, { populate: ['branch'] }),
    }),

    create: (data) => ({
        path: '/pay-statutory-remittances',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-statutory-remittances/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-statutory-remittances/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin'],
    }),

    /** Post the remittance JE and mark it Paid. */
    process: (documentId, extra = {}) => ({
        path: `/pay-statutory-remittances/${documentId}/process`,
        action: 'process',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),
};
