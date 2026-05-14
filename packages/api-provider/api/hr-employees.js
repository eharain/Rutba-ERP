import { listParams, byIdParams } from './__param_builders.js';

export const HrEmployeesEndpoints = {
    meta: { domains: ['hr'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-employees',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-employees/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({ path: '/hr-employees' , data }),
    update: (documentId, data) => ({ path: `/hr-employees/${documentId}` , data }),

};