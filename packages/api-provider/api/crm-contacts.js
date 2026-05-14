import { listParams, byIdParams } from './__param_builders.js';

export const CrmContactsEndpoints = {
    meta: { domains: ['crm'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-contacts',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/crm-contacts/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),

};