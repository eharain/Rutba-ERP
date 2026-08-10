/**
 * CmpAudiencesEndpoints
 * Who a campaign goes to.
 *
 * An audience is resolved server-side through one contract —
 * `resolve(audience) → [{ email, mergeData }]` — so the `segment` source can
 * later point at a real crm-segment engine (ROADMAP 0.6) without the campaign
 * runner or these descriptors changing.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpAudiencesEndpoints = {

    meta: {
        uid: 'api::cmp-audience.cmp-audience',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, source, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/cmp-audiences',
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
                        ...(source ? { source } : {}),
                        ...(term ? { name: { $containsi: term } } : {}),
                        ...(filters || {}),
                    },
                },
                { sort: ['updatedAt:desc'] },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-audiences/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/cmp-audiences',
        action: 'create',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/cmp-audiences/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/cmp-audiences/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['campaigns'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Run the resolver: returns { total, sample, mergeKeys } and refreshes the
     * cached member_count — the composer's recipient check.
     */
    resolveMembers: (documentId) => ({
        path: `/cmp-audiences/${documentId}/resolve`,
        action: 'resolveMembers',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

};
