/**
 * WorkItemCommentsEndpoints
 * Generic discussion thread for workflow-driven work items (keyed by
 * entity_uid + target_document_id). Author is stamped server-side from the
 * authenticated user. Shared by the manufacturing, order-management, mail
 * (shared-inbox internal notes) and CRM apps — CRM contacts use this instead
 * of carrying their own comment table.
 */
export const WorkItemCommentsEndpoints = {

    meta: {
        uid: 'api::work-item-comment.work-item-comment',
        domains: ['mail', 'manufacturing', 'order-management', 'crm'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ entityUid, targetDocumentId, page = 1, pageSize = 100, sort } = {}) => ({
        path: '/work-item-comments',
        action: 'find',
        method: 'get',
        apps: ['mail', 'manufacturing', 'order-management', 'crm'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(entityUid ? { entity_uid: entityUid } : {}),
                ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:asc'],
            populate: { author: { fields: ['id', 'username', 'email'] } },
        },
    }),

    /** Body: { entity_uid, target_document_id, body }. Author stamped server-side. */
    create: (data) => ({
        path: '/work-item-comments',
        action: 'create',
        method: 'post',
        apps: ['mail', 'manufacturing', 'order-management', 'crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
