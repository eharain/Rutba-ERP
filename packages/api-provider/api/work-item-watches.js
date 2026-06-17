/**
 * WorkItemWatchesEndpoints
 * Generic watchers for workflow-driven work items (keyed by entity_uid +
 * target_document_id). `toggle` watches/unwatches for the authenticated user.
 * Shared by the manufacturing and order-management apps.
 */
export const WorkItemWatchesEndpoints = {

    meta: {
        uid: 'api::work-item-watch.work-item-watch',
        domains: ['manufacturing', 'order-management'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ entityUid, targetDocumentId, userId, page = 1, pageSize = 200, sort } = {}) => ({
        path: '/work-item-watches',
        action: 'find',
        method: 'get',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(entityUid ? { entity_uid: entityUid } : {}),
                ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
                ...(userId ? { user: { id: userId } } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { user: { fields: ['id', 'username', 'email'] } },
        },
    }),

    /** Body: { entity_uid, target_document_id }. Idempotent toggle for the caller. */
    toggle: (data) => ({
        path: '/work-item-watches/toggle',
        action: 'toggle',
        method: 'post',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
