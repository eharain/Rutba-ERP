import { listParams, byIdParams } from './__param_builders.js';

/**
 * MarketplaceListingsEndpoints
 * Per (account, product) listing selection + price-adjustment state. The
 * operator UI selects which products to publish to a marketplace and sets a
 * per-listing price % here; the worker reads selected rows (service token) and
 * pushes the adjusted price + stock. Pure datastore.
 */
export const MarketplaceListingsEndpoints = {
    meta: { uid: 'api::marketplace-listing.marketplace-listing', domains: ['marketplace'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/marketplace-listings',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], pageSize: 500 },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/marketplace-listings/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({ path: '/marketplace-listings', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/marketplace-listings/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/marketplace-listings/${documentId}`, action: 'delete', method: 'delete' }),
};
