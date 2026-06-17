import { listParams, byIdParams } from './__param_builders.js';

/**
 * MarketplaceMappingsEndpoints
 * CRUD for the taxonomy-mapping store (internal category/brand/term/term-type →
 * a marketplace's taxonomy id). The operator UI maps via these; the worker reads
 * them (service token) when building listings. Pure datastore — no engine here.
 */
export const MarketplaceMappingsEndpoints = {
    meta: { uid: 'api::marketplace-mapping.marketplace-mapping', domains: ['marketplace'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/marketplace-mappings',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], pageSize: 500 },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/marketplace-mappings/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({ path: '/marketplace-mappings', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/marketplace-mappings/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/marketplace-mappings/${documentId}`, action: 'delete', method: 'delete' }),
};
