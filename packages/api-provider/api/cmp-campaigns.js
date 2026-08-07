/**
 * CmpCampaignsEndpoints
 * Template + audience + sending identity + schedule.
 *
 * CRUD only for now. The lifecycle routes (send-now, pause, resume, cancel,
 * test-send) land with their controllers in Phase 2/3 — declaring them here
 * before the handlers exist would seed api-pro policies for routes that 404.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpCampaignsEndpoints = {

    meta: {
        uid: 'api::cmp-campaign.cmp-campaign',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, status, channel, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/cmp-campaigns',
            action: 'find',
            method: 'get',
            apps: ['campaigns'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                {
                    page,
                    pageSize,
                    sort,
                    fields,
                    populate,
                    filters: {
                        ...(status ? { status } : {}),
                        ...(channel ? { channel } : {}),
                        ...(term ? { name: { $containsi: term } } : {}),
                        ...(filters || {}),
                    },
                },
                {
                    sort: ['createdAt:desc'],
                    populate: { template: true, audience: true, sending_identity: true },
                },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-campaigns/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams(
            { populate, fields },
            { populate: { template: true, audience: true, sending_identity: true, runs: true } },
        ),
    }),

    create: (data) => ({
        path: '/cmp-campaigns',
        action: 'create',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/cmp-campaigns/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/cmp-campaigns/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['campaigns'],
        approle: ['admin', 'manager'],
    }),

};
