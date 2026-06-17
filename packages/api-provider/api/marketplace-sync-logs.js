import { listParams, byIdParams } from './__param_builders.js';

/**
 * MarketplaceSyncLogsEndpoints
 * Read-only endpoint descriptors for the /marketplace-sync-logs resource — the
 * audit trail of order pulls / inventory pushes / token refreshes that the
 * marketplace admin UI lists per account.
 */
export const MarketplaceSyncLogsEndpoints = {
    meta: { uid: 'api::marketplace-sync-log.marketplace-sync-log', domains: ['marketplace'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/marketplace-sync-logs',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], pageSize: 50 },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/marketplace-sync-logs/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
};
