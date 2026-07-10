/**
 * MfgProductionTemplatesEndpoints
 * Pure endpoint descriptors for the /mfg-production-templates resource — the
 * reusable product-type recipe layer above per-product BOMs.
 */
export const MfgProductionTemplatesEndpoints = {

    meta: {
        uid: 'api::mfg-production-template.mfg-production-template',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-production-templates',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: {
                output_category: true,
                input_lines: { populate: { category: true } },
                output_lines: { populate: { category: true } },
                routing_steps: { populate: { operation: true } },
            },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-production-templates/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                output_category: true,
                input_lines: { populate: { category: true } },
                output_lines: { populate: { category: true } },
                routing_steps: { populate: { operation: true } },
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-production-templates',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-production-templates/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-production-templates/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Resolve the template's category/kind slots to concrete products and emit a
     * versioned mfg-bom (Draft unless `activate:true`).
     * @param {string} documentId
     * @param {object} opts { outputProduct, inputMap, outputMap, name, version, production_line, activate }
     */
    instantiate: (documentId, opts = {}) => ({
        path: `/mfg-production-templates/${documentId}/instantiate`,
        action: 'instantiate',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: opts,
    }),
};
