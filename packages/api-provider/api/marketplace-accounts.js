import { listParams, byIdParams } from './__param_builders.js';

/**
 * MarketplaceAccountsEndpoints
 * Endpoint descriptors for the /marketplace-accounts resource — the operator
 * UI's view of connected accounts. The sync ENGINE (connect/validate/sync) lives
 * in the rutba-marketplace app's own API routes, not in Strapi, so only the data
 * CRUD is described here. Credential writes are admin-gated in the controller;
 * the worker's `secrets` + `ingest-orders` endpoints are API-token-only (no
 * api-pro policy / not called by the UI).
 */
export const MarketplaceAccountsEndpoints = {
    meta: { uid: 'api::marketplace-account.marketplace-account', domains: ['marketplace'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/marketplace-accounts',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/marketplace-accounts/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({ path: '/marketplace-accounts', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/marketplace-accounts/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/marketplace-accounts/${documentId}`, action: 'delete', method: 'delete' }),
};
