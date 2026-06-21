import { listParams, byIdParams } from './__param_builders.js';

/**
 * MarketplacePriceRulesEndpoints
 * Per-account, per-category price adjustment rules (percentage and/or fixed,
 * raise or lower). The operator UI manages them; the worker reads them (service
 * token) when computing the pushed price. Pure datastore.
 */
export const MarketplacePriceRulesEndpoints = {
    meta: { uid: 'api::marketplace-price-rule.marketplace-price-rule', domains: ['marketplace'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/marketplace-price-rules',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['priority:desc'], pageSize: 500 },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/marketplace-price-rules/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({ path: '/marketplace-price-rules', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/marketplace-price-rules/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/marketplace-price-rules/${documentId}`, action: 'delete', method: 'delete' }),
};
