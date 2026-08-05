import { listParams, byIdParams } from './__param_builders.js';

export const HrAssetAssignmentsEndpoints = {
    meta: {
        uid: 'api::hr-asset-assignment.hr-asset-assignment',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own asset assignment history (self-service). */
    listMine: () => ({
        path: '/hr-asset-assignments/mine',
        action: 'myAssignments',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** HR processes a return — closes the assignment and frees the asset back to Available. */
    returnAsset: (documentId, data) => ({
        path: `/hr-asset-assignments/${documentId}/return`,
        action: 'returnAsset',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-asset-assignments',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['assigned_date:desc'], populate: ['asset', 'employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-asset-assignments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
