/**
 * CmpTemplatesEndpoints
 * Campaign message templates — the store MTA deliberately doesn't keep
 * (FUNCTION.md: "reusable saved template library → caller app"). Rendered here
 * and passed inline to /v1/send/batch.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpTemplatesEndpoints = {

    meta: {
        uid: 'api::cmp-template.cmp-template',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, folder, status, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/cmp-templates',
            action: 'find',
            method: 'get',
            apps: ['campaigns'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                {
                    page,
                    pageSize,
                    sort,
                    populate,
                    fields,
                    filters: {
                        ...(folder ? { folder } : {}),
                        ...(status ? { status } : {}),
                        ...(term ? { name: { $containsi: term } } : {}),
                        ...(filters || {}),
                    },
                },
                { sort: ['updatedAt:desc'] },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-templates/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/cmp-templates',
        action: 'create',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/cmp-templates/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/cmp-templates/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['campaigns'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Render the template with sample merge values. Returns the rendered
     * subject/html/text plus `mergeKeys` and `missingKeys`, so the studio can
     * show what an audience will have to supply.
     */
    getPreview: (documentId, { data, utm } = {}) => ({
        path: `/cmp-templates/${documentId}/preview`,
        action: 'getPreview',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data: { ...(data ? { data } : {}), ...(utm ? { utm } : {}) },
    }),

    /**
     * Send one rendered copy to a real inbox. Goes out transactional, so it
     * bypasses marketing pacing and stays out of the marketing reputation stats.
     */
    sendTest: (documentId, { to, data, identityDocId } = {}) => ({
        path: `/cmp-templates/${documentId}/test-send`,
        action: 'sendTest',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data: { to, ...(data ? { data } : {}), ...(identityDocId ? { identityDocId } : {}) },
    }),

    /** Copy a template into a new Draft. */
    duplicateTemplate: (documentId) => ({
        path: `/cmp-templates/${documentId}/duplicate`,
        action: 'duplicateTemplate',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

};
