/**
 * CmpRunsEndpoints
 * One execution of a campaign — read-only from the client.
 *
 * Runs are engine-written (the campaign runner creates them, the report poller
 * and the webhook receiver update them), so there is deliberately no create /
 * update / delete descriptor: no descriptor means no api-pro policy, which
 * means the interceptor denies those verbs no matter what UP granted.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpRunsEndpoints = {

    meta: {
        uid: 'api::cmp-run.cmp-run',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, campaignDocId, state } = {}) => ({
        path: '/cmp-runs',
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
                    ...(campaignDocId ? { campaign: { documentId: campaignDocId } } : {}),
                    ...(state ? { state } : {}),
                    ...(filters || {}),
                },
            },
            { sort: ['started_at:desc', 'createdAt:desc'], populate: { campaign: true } },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-runs/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, { populate: { campaign: true } }),
    }),

    /** Pull the MTA batch report into the run counters on demand. */
    syncRun: (documentId) => ({
        path: `/cmp-runs/${documentId}/sync`,
        action: 'syncRun',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

};
