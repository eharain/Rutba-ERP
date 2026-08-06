import { listParams, byIdParams } from './__param_builders.js';

export const HrIncidentReportsEndpoints = {
    meta: {
        uid: 'api::hr-incident-report.hr-incident-report',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    report: (data) => ({
        path: '/hr-incident-reports/report',
        action: 'reportIncident',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    listMine: () => ({
        path: '/hr-incident-reports/mine',
        action: 'myIncidents',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-incident-reports',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['incident_date:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-incident-reports/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-incident-reports',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-incident-reports/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-incident-reports/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
