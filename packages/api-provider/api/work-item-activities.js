/**
 * WorkItemActivitiesEndpoints
 * Generic, entity-agnostic audit trail for workflow-driven work items
 * (keyed by entity_uid + target_document_id). Plus the `assign` action that
 * sets a work item's assignee and records it. Shared by the manufacturing
 * (work orders) and order-management (sale orders + returns) apps.
 */
export const WorkItemActivitiesEndpoints = {

    meta: {
        uid: 'api::work-item-activity.work-item-activity',
        domains: ['manufacturing', 'order-management'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ entityUid, targetDocumentId, page = 1, pageSize = 100, sort } = {}) => ({
        path: '/work-item-activities',
        action: 'find',
        method: 'get',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(entityUid ? { entity_uid: entityUid } : {}),
                ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { actor: { fields: ['id', 'username', 'email'] } },
        },
    }),

    /**
     * Set (or clear) a work item's assignee. Body:
     *   { entity_uid, target_document_id, assignee_document_id|null }
     * Route is auth:false + ensureUser server-side.
     */
    assign: (data) => ({
        path: '/work-item-activities/assign',
        action: 'assign',
        method: 'post',
        apps: ['manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
