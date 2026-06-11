/**
 * WorkflowsEndpoints
 * Pure endpoint descriptors for the /workflows resource — definable stage
 * workflows (stages + transitions) consumed by entity state machines.
 * Shared by the manufacturing (work orders) and order-management (sale
 * orders) apps.
 */
export const WorkflowsEndpoints = {

    meta: {
        uid: 'api::workflow.workflow',
        domains: ['manufacturing', 'order-management'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { entityUid, sort } = {}) => ({
        path: '/workflows',
        action: 'find',
        method: 'get',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(entityUid ? { entity_uid: entityUid } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['name:asc'],
            populate: { stages: true, transitions: true },
        },
    }),

    byId: (documentId) => ({
        path: `/workflows/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { stages: true, transitions: true },
        },
    }),

    create: (data) => ({
        path: '/workflows',
        action: 'create',
        method: 'post',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/workflows/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/workflows/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin'],
    }),
};
