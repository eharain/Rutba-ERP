/**
 * CrmActivitiesEndpoints
 * Centralised path + params definitions for /crm-activities.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmActivitiesEndpoints = {

    meta: {
        uid: 'api::crm-activity.crm-activity',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-activities',
        action: 'find',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: ['contact'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/crm-activities/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Descriptor: log a CRM activity (call, email, meeting, note, follow-up). */
    create: (data) => ({
        path: '/crm-activities',
        action: 'create',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Descriptor: update a CRM activity by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/crm-activities/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Descriptor: delete a CRM activity by documentId. */
    del: (documentId) => ({
        path: `/crm-activities/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['crm'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Descriptor: the 360° timeline for one subject. Pass exactly one of
     * contact / lead / person (documentId). Merges typed CRM touches with the
     * shared work-item collaboration primitive (comments + audit trail) into
     * one reverse-chronological feed.
     *
     * Custom route — `action` must equal the Strapi handler name
     * ('api::crm-activity.crm-activity.timeline'), because the api-pro
     * interceptor matches policies on the action, not the path.
     */
    getTimeline: ({ contact, lead, person, limit } = {}) => ({
        path: '/crm-activities/timeline',
        action: 'timeline',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            ...(contact ? { contact } : {}),
            ...(lead ? { lead } : {}),
            ...(person ? { person } : {}),
            ...(limit ? { limit } : {}),
        },
    }),

    /** Descriptor: the follow-up reminder queue, most overdue first. */
    listFollowups: ({ window = 'week', page = 1, pageSize = 50, mine } = {}) => ({
        path: '/crm-activities/followups',
        action: 'followups',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: { window, page, pageSize, ...(mine ? { mine: 'true' } : {}) },
    }),

    /** Descriptor: close (or reopen) an activity's follow-up. Body: { done }. */
    markFollowupDone: (documentId, data = { done: true }) => ({
        path: `/crm-activities/${documentId}/complete-followup`,
        action: 'completeFollowup',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

};
